/** Role vocabulary, shared by the server queries and the forms that set them.
 *
 *  Deliberately outside lib/team.ts: that module is server-only, and a client
 *  component importing a value from it drags the whole server module — database
 *  client included — into the browser bundle.
 */
export const ROLES = [
  { key: "org_admin", label: "Kurum yöneticisi", scope: "Bütün şubeler · skor hesaplayabilir" },
  { key: "branch_manager", label: "Şube yöneticisi", scope: "Tek şube · aktarım yapabilir" },
  { key: "teacher", label: "Eğitmen", scope: "Yalnızca kendi öğrencileri" },
  { key: "viewer", label: "Görüntüleyici", scope: "Tek şube · salt okuma" }
] as const;
export type Role = (typeof ROLES)[number]["key"];
export const roleLabel = (r: string) => ROLES.find(x => x.key === r)?.label ?? r;
export const isRole = (v: string): v is Role => ROLES.some(r => r.key === v);

export type Member = {
  id: string; userId: string; name: string | null; role: Role;
  branch: string | null; students: number;
};
