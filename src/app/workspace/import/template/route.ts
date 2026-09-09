import { requireUser } from "@/lib/auth";
import { REQUIRED, OPTIONAL } from "@/lib/csv";
import { loadSettings } from "@/lib/settings";
import { fetchAll } from "@/lib/paginate";

export const dynamic = "force-dynamic";

/** The blank file the institution fills in.
 *
 *  Generated rather than shipped, so the two example rows carry this
 *  institution's own branch and level names: the two columns an upload fails on
 *  most often are the two a template cannot guess in advance. Semicolons,
 *  because that is what Turkish Excel writes and reads back without asking.
 */
export async function GET() {
  const { client } = await requireUser();
  const [settings, branches] = await Promise.all([
    loadSettings(client),
    fetchAll<{ name: string }>(() => client.from("branches").select("name").order("name"), "Şubeler okunamadı")
  ]);
  const branch = branches[0]?.name ?? "Şube adı";
  const level = settings.levels[0] ?? "A1";

  const columns = [...REQUIRED, ...OPTIONAL];
  const example = (id: string, name: string, marks: (string | number)[]) =>
    [id, name, branch, level, "Eğitmen Adı", ...marks].join(";");

  const csv = [
    columns.join(";"),
    example("S001", "Örnek Öğrenci", [92, 88, 74, 78, 81, 83, 77, 80, 84, 79, 8, 92, "hayır", 8]),
    example("S002", "İkinci Örnek", [68, 54, 62, 58, 55, 49, 41, 60, 58, 55, 3, 48, "evet", 4])
  ].join("\r\n") + "\r\n";

  // A byte-order mark, or Excel opens Turkish characters as mojibake.
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ogrenci-listesi-sablonu.csv"',
      "Cache-Control": "no-store"
    }
  });
}
