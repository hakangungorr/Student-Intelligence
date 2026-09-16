import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStudent } from "@/lib/student";
import { loadAssessments } from "@/lib/assessments";
import { loadLibrary } from "@/lib/library";
import { defaultCheckOn, loadPlans, suggest } from "@/lib/plan";

/** Bir öğrencinin planı için gereken her şey, tek yerde.
 *
 *  Used by the Plan tab to draw the suggestions and by the server actions to
 *  act on one. The actions recompute rather than trusting what the form sent: a
 *  suggestion is identified by its key, and its title, reason and library item
 *  come from the evidence as it stands now — a posted form cannot put words in
 *  a plan that the evidence does not support.
 */
export async function planContext(client: SupabaseClient, studentId: string) {
  const card = await loadStudent(client, studentId);
  if (!card) return null;
  const [byStudent, library, byPlan] = await Promise.all([
    loadAssessments(client, [studentId]), loadLibrary(client), loadPlans(client, [studentId])
  ]);
  const assessments = byStudent.get(studentId) ?? [];
  const plans = byPlan.get(studentId) ?? [];
  const open = plans.find(p => p.status === "open") ?? null;

  // Hidden: whatever the open plan already holds, and staff work that was done
  // against this same risk checkpoint in an earlier plan. Closing a plan should
  // not bring back the phone call that was already made.
  const already = new Set<string>();
  for (const t of open?.tasks ?? []) if (t.sourceKey) already.add(t.sourceKey);
  for (const p of plans) {
    if (p.status !== "closed" || !card.snapshotPeriod || p.sourcePeriodEnd !== card.snapshotPeriod) continue;
    for (const t of p.tasks) if (t.kind === "staff" && t.status === "done" && t.sourceKey) already.add(t.sourceKey);
  }

  const checkOn = open?.checkOn ?? defaultCheckOn();
  const suggestions = suggest({
    steps: card.risk?.needsAction ? card.risk.steps : [],
    because: card.risk?.headline ?? "",
    assessments, level: card.level, branchId: card.branchId,
    library, checkOn, already
  });
  return { card, assessments, plans, open, suggestions, checkOn };
}
