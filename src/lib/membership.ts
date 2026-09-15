import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/roles";

/** Kullanıcının bu kurumdaki yeri: rolü ve varsa şubesi.
 *
 *  Read from memberships under the user's own RLS, so it can only ever return
 *  the row that belongs to them. The screens use it to decide what to offer, not
 *  to decide what is allowed — that stays in the database, where a mistake here
 *  cannot turn into access somebody did not have.
 */
export type Membership = { organizationId: string; role: Role; branchId: string | null };

export async function currentMembership(client: SupabaseClient): Promise<Membership | null> {
  const { data, error } = await client.from("memberships")
    .select("organization_id,role,branch_id").limit(1).maybeSingle();
  if (error || !data) return null;
  return {
    organizationId: data.organization_id as string,
    role: data.role as Role,
    branchId: (data.branch_id as string) ?? null
  };
}
export const canManageCatalogue = (m: Membership | null) => m?.role === "org_admin";
export const canScheduleSessions = (m: Membership | null) =>
  m?.role === "org_admin" || m?.role === "branch_manager";
/** Planning is teaching work: an institution admin, the branch that runs the
 *  class, or the teacher the student is enrolled with. A viewer reads. */
export const canPlan = (m: Membership | null) =>
  m?.role === "org_admin" || m?.role === "branch_manager" || m?.role === "teacher";
