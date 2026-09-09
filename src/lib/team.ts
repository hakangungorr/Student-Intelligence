import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paginate";
import { ROLES, type Role, type Member } from "@/lib/roles";

export type { Member } from "@/lib/roles";

export type Team = {
  members: Member[]; branches: { id: string; name: string }[]; levels: string[];
  teachers: Member[];
};

export async function loadTeam(client: SupabaseClient): Promise<Team> {
  const oops = "Ekip listesi yüklenemedi";
  const [memberships, branches, enrollments] = await Promise.all([
    fetchAll<{ id: string; user_id: string; display_name: string | null; role: Role; branch_id: string | null }>(
      () => client.from("memberships").select("id,user_id,display_name,role,branch_id"), oops),
    fetchAll<{ id: string; name: string }>(
      () => client.from("branches").select("id,name").order("name"), oops),
    fetchAll<{ student_id: string; level: string; teacher_id: string | null }>(
      () => client.from("enrollments").select("student_id,level,teacher_id").eq("active", true), oops)
  ]);
  const branchName = new Map(branches.map(b => [b.id, b.name]));
  const taught = new Map<string, number>();
  for (const e of enrollments) if (e.teacher_id)
    taught.set(e.teacher_id, (taught.get(e.teacher_id) ?? 0) + 1);

  const members: Member[] = memberships.map(m => ({
    id: m.id, userId: m.user_id, name: m.display_name, role: m.role,
    branch: m.branch_id ? branchName.get(m.branch_id) ?? "—" : null,
    students: taught.get(m.user_id) ?? 0
  })).sort((a, b) =>
    ROLES.findIndex(r => r.key === a.role) - ROLES.findIndex(r => r.key === b.role)
    || (a.name ?? "").localeCompare(b.name ?? "", "tr"));

  return {
    members, branches, levels: [...new Set(enrollments.map(e => e.level))].sort(),
    teachers: members.filter(m => m.role === "teacher")
  };
}

/** Assigns a class to a teacher in one go.
 *
 *  A teacher's access is defined by enrollments.teacher_id, so until a class is
 *  assigned the teacher signs in and sees nothing. Assigning twenty-four students
 *  one at a time is the kind of setup nobody finishes, so the unit here is the
 *  class: a branch and a level. teacher_name is written alongside, because the
 *  student card names the instructor and cannot read auth.users to find one.
 */
export async function assignClass(
  client: SupabaseClient, teacherUserId: string, teacherName: string | null,
  branchId: string, level: string
): Promise<number> {
  const students = await fetchAll<{ id: string; branch_id: string }>(
    () => client.from("students").select("id,branch_id").eq("branch_id", branchId).eq("active", true),
    "Öğrenciler okunamadı");
  if (!students.length) return 0;

  const rows = await fetchAll<{ id: string; student_id: string }>(
    () => client.from("enrollments").select("id,student_id")
      .in("student_id", students.map(s => s.id)).eq("level", level).eq("active", true),
    "Kur kayıtları okunamadı");
  if (!rows.length) return 0;

  const { error } = await client.from("enrollments")
    .update({ teacher_id: teacherUserId, teacher_name: teacherName })
    .in("id", rows.map(r => r.id));
  if (error) throw new Error(error.message);
  return rows.length;
}
