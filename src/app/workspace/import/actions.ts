"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseRoster, type Issue } from "@/lib/csv";
import { writeRoster } from "@/lib/import";
import { latestPeriod, scoreInstitution } from "@/lib/scoring";
import { loadSettings } from "@/lib/settings";

const MAX_BYTES = 2_000_000;   // a term's roster is tens of KB; this is a wide margin

export type PreviewState = {
  status: "empty" | "ready" | "error" | "done";
  /** Fresh for every preview, so a finished import cannot leave its result on
   *  screen while the next file is being reviewed. */
  token?: string;
  message?: string;
  filename?: string;
  text?: string;
  periodEnd?: string;
  sample?: { line: number; externalId: string; name: string; branch: string; level: string }[];
  accepted?: number;
  /** Distinct lines the parser refused, and the number of problems it found in
   *  them. One line with three bad marks is one rejected student and three
   *  issues; reporting the issue count as students was how the history came to
   *  claim "3 satır aktarıldı, 4 atlandı" for a file of four rows. */
  rejected?: number;
  issues?: Issue[];
  unknown?: string[];
  result?: { created: number; updated: number; measurements: number; observations: number };
  /** Set when the write stopped part-way. The same file can simply be uploaded
   *  again: every stage finds and corrects rather than re-inserting. */
  stopped?: { stage: string; message: string };
  scored?: number | null;
  /** Which evaluation checkpoint this import will refresh, already formatted.
   *  The date on the form is when the marks were measured; the checkpoint they
   *  are scored into is a separate decision, and the screen has to stop
   *  implying they are the same one. */
  refreshes?: string | null;
  canScore?: boolean;
};

const dayText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(y, m - 1, d));
};

/** How many students the file actually lost. Every rejection path in the parser
 *  skips the line it complains about, so the distinct lines carrying an issue
 *  are exactly the students who did not make it. */
const rejectedLines = (issues: Issue[]) => new Set(issues.map(i => i.line)).size;

const period = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı.");

async function scope() {
  const { client } = await requireUser();
  const membership = await client.from("memberships").select("organization_id,role").limit(1).maybeSingle();
  if (membership.error || !membership.data) throw new Error("Kurum erişiminiz bulunamadı.");
  const branches = await client.from("branches").select("id,name").order("name");
  if (branches.error) throw new Error("Şubeler okunamadı.");
  const settings = await loadSettings(client);
  return {
    client, organizationId: membership.data.organization_id as string,
    canScore: membership.data.role === "org_admin",
    branchIds: new Map(branches.data.map(b => [b.name as string, b.id as string])),
    branchNames: branches.data.map(b => b.name as string),
    levels: settings.levels
  };
}

export async function preview(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const file = form.get("file");
  const when = period.safeParse(String(form.get("periodEnd") ?? ""));
  if (!when.success) return { status: "error", message: when.error.issues[0].message };
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Bir CSV dosyası seçin." };
  if (file.size > MAX_BYTES) return { status: "error", message: "Dosya 2 MB sınırını aşıyor." };

  const { client, branchNames, levels, canScore } = await scope();
  const current = await latestPeriod(client);
  const text = await file.text();
  const parsed = parseRoster(text, branchNames, levels);

  if (parsed.missing.length) return {
    status: "error", filename: file.name,
    message: `Zorunlu sütun eksik: ${parsed.missing.join(", ")}. Başlık satırı bulunan sütunlar: ${parsed.headers.join(", ") || "yok"}.`
  };
  if (!parsed.rows.length) return {
    status: "error", filename: file.name, issues: parsed.issues,
    message: "Aktarılabilecek satır yok."
  };

  return {
    status: "ready", token: crypto.randomUUID(), filename: file.name, text, periodEnd: when.data,
    refreshes: current === null ? null : dayText(current), canScore,
    accepted: parsed.rows.length, rejected: rejectedLines(parsed.issues),
    issues: parsed.issues, unknown: parsed.unknown,
    sample: parsed.rows.slice(0, 8).map(r =>
      ({ line: r.line, externalId: r.externalId, name: r.name, branch: r.branch, level: r.level }))
  };
}

export async function commit(_prev: PreviewState, form: FormData): Promise<PreviewState> {
  const text = String(form.get("text") ?? "");
  const filename = String(form.get("filename") ?? "roster.csv");
  const when = period.safeParse(String(form.get("periodEnd") ?? ""));
  if (!when.success) return { status: "error", message: when.error.issues[0].message };
  if (!text) return { status: "error", message: "Önizlenen dosya kayboldu, yeniden yükleyin." };

  const { client, organizationId, branchIds, branchNames, levels, canScore } = await scope();
  const parsed = parseRoster(text, branchNames, levels);
  if (!parsed.rows.length) return { status: "error", message: "Aktarılabilecek satır yok." };

  const { data: session } = await client.auth.getUser();
  if (!session.user) return { status: "error", message: "Oturum bulunamadı." };

  let result;
  try {
    result = await writeRoster(client, organizationId, branchIds, parsed.rows, when.data, session.user.id);
  } catch (e) {
    return { status: "error", message: `Aktarım yazılamadı: ${(e as Error).message}` };
  }

  const rejected = rejectedLines(parsed.issues);
  // Recorded after the write, so the history never claims an import that failed.
  // skipped_count keeps being written as the rejected-row count so the column
  // finally means what its header always said; the issue count moved to a column
  // of its own rather than continuing to impersonate it.
  const recorded = await client.from("import_batches").insert({
    organization_id: organizationId, filename, row_count: parsed.rows.length,
    created_count: result.created, updated_count: result.updated,
    skipped_count: rejected, rejected_count: rejected, issue_count: parsed.issues.length
  });

  // An import that leaves the agenda showing yesterday's scores has not finished
  // the job it was asked to do. Not after a stopped write, though: scoring a
  // half-written roster produces a checkpoint nobody can interpret.
  let scored: number | null = null;
  if (canScore && !result.stopped) {
    const period = (await latestPeriod(client)) ?? when.data;
    scored = (await scoreInstitution(client, organizationId, period)).scored;
  }

  revalidatePath("/workspace");
  revalidatePath("/workspace/students");
  revalidatePath("/workspace/ask");
  revalidatePath("/workspace/entry");
  return {
    status: "done", filename, result, scored, stopped: result.stopped,
    accepted: parsed.rows.length, rejected, issues: parsed.issues,
    message: recorded.error ? "Veriler yazıldı, ancak aktarım geçmişine kaydedilemedi." : undefined
  };
}

export type ScoreState = {
  status: "idle" | "done" | "error";
  message?: string;
  scored?: number; created?: number; updated?: number;
  skipped?: { externalId: string; reason: string }[];
};

/** Recomputes every score the administrator can see and stores the result.
 *  Separate from the import on purpose: a roster upload and a scoring run fail
 *  for different reasons, and a partial import should not leave stale scores
 *  looking freshly calculated. */
export async function score(_prev: ScoreState, form: FormData): Promise<ScoreState> {
  const when = period.safeParse(String(form.get("periodEnd") ?? ""));
  if (!when.success) return { status: "error", message: when.error.issues[0].message };

  const { client, organizationId } = await scope();
  try {
    const result = await scoreInstitution(client, organizationId, when.data);
    if (!result.scored) return {
      status: "error",
      message: "Puanlanabilecek öğrenci yok — hepsinde eksik veri var.",
      skipped: result.skipped
    };
    revalidatePath("/workspace");
    revalidatePath("/workspace/students");
    revalidatePath("/workspace/ask");
    return {
      status: "done", scored: result.scored, created: result.created,
      updated: result.updated, skipped: result.skipped
    };
  } catch (e) {
    return { status: "error", message: `Hesaplama yapılamadı: ${(e as Error).message}` };
  }
}
