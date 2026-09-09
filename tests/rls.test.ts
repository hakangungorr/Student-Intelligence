import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const db = new PGlite();
const id = (n:number) => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
async function asUser(user:number, sql:string) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id(user)}',false);`);
  return db.query(sql);
}
beforeAll(async()=>{
  // Supabase supplies auth.users/auth.uid and these roles. Simulate the verified
  // request identity, but execute the actual migration and PostgreSQL RLS rules.
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  // Every migration, in order: a policy added later must not quietly widen an
  // earlier boundary, and these tests are the only place that would notice.
  const dir = new URL("../supabase/migrations/",import.meta.url);
  for (const file of (await readdir(dir)).filter(f=>f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file,dir),"utf8"));
  await db.exec(`insert into auth.users values ${[1,2,3,4,5,6].map(n=>`('${id(n)}')`).join(",")};
    insert into public.organizations(id,name) values ('${id(10)}','American LIFE'),('${id(11)}','Other school');
    insert into public.branches(id,organization_id,name) values
    ('${id(20)}','${id(10)}','İzmir'),('${id(21)}','${id(10)}','Ankara'),('${id(22)}','${id(11)}','Other branch');
    insert into public.memberships(user_id,organization_id,branch_id,role) values
    ('${id(1)}','${id(10)}',null,'org_admin'),
    ('${id(2)}','${id(10)}','${id(20)}','branch_manager'),
    ('${id(3)}','${id(10)}','${id(20)}','teacher'),
    ('${id(4)}','${id(10)}','${id(20)}','viewer'),
    ('${id(5)}','${id(11)}',null,'org_admin');
    insert into public.students(id,organization_id,branch_id,external_id,name) values
    ('${id(30)}','${id(10)}','${id(20)}','S1','Assigned'),
    ('${id(31)}','${id(10)}','${id(20)}','S2','Unassigned'),
    ('${id(32)}','${id(10)}','${id(21)}','S3','Ankara student'),
    ('${id(33)}','${id(11)}','${id(22)}','S4','Other school student');
    insert into public.enrollments(organization_id,branch_id,student_id,level,teacher_id,starts_on)
    values ('${id(10)}','${id(20)}','${id(30)}','B1','${id(3)}','2026-09-01');`);
},30000);
afterAll(async()=>{await db.close();});
describe("database tenant and branch boundaries",()=>{
  it("institution admin sees own three students and own institution only",async()=>{
    expect((await asUser(1,"select * from public.students")).rows).toHaveLength(3);
    expect((await asUser(1,"select * from public.organizations")).rows).toHaveLength(1);
  });
  it("branch manager sees two students, never another branch",async()=>{
    expect((await asUser(2,"select * from public.students")).rows).toHaveLength(2);
    expect((await asUser(2,"select * from public.branches")).rows).toHaveLength(1);
  });
  it("teacher sees only assigned students, not every student in their branch",async()=>{
    expect((await asUser(3,"select name from public.students")).rows).toEqual([{name:"Assigned"}]);
  });
  it("a user without membership sees nothing",async()=>{
    expect((await asUser(6,"select * from public.students")).rows).toHaveLength(0);
    expect((await asUser(6,"select * from public.organizations")).rows).toHaveLength(0);
  });
  it("cannot read another institution even with explicit ID",async()=>{
    expect((await asUser(5,`select * from public.students where id='${id(30)}'`)).rows).toHaveLength(0);
  });
  it("anonymous users cannot query student tables",async()=>{
    await db.exec("reset role; set role anon;");
    await expect(db.query("select * from public.students")).rejects.toThrow(/permission denied/);
  });
  // RLS filters rows on UPDATE and DELETE rather than raising, so a blocked write
  // is a write that touched nothing. Asserting on the error would pass for the
  // wrong reason the day the policy changed.
  it("cannot promote oneself or change branch membership",async()=>{
    expect((await asUser(4,"update public.memberships set role='org_admin',branch_id=null")).affectedRows).toBe(0);
    expect((await asUser(4,"select role from public.memberships")).rows).toEqual([{role:"viewer"}]);
  });
  const actionInsert = (student=30,branch=20) => `insert into public.actions(organization_id,branch_id,student_id,title)
    values ('${id(10)}','${id(branch)}','${id(student)}','Öğrenci görüşmesi') returning id`;
  it("viewer cannot create actions",async()=>{await expect(asUser(4,actionInsert())).rejects.toThrow(/row-level security/);});
  it("teacher cannot act on unassigned student",async()=>{await expect(asUser(3,actionInsert(31))).rejects.toThrow(/row-level security/);});
  it("manager creates action with immutable audit; author and scope cannot be edited",async()=>{
    const result=await asUser(2,actionInsert());
    const actionId=(result.rows[0] as {id:string}).id;
    await asUser(2,`update public.actions set status='completed' where id='${actionId}'`);
    expect((await asUser(2,`select * from public.audit_events where entity_id='${actionId}'`)).rows).toHaveLength(2);
    await expect(asUser(2,`update public.actions set branch_id='${id(21)}' where id='${actionId}'`)).rejects.toThrow(/permission denied/);
    await expect(asUser(2,"delete from public.audit_events")).rejects.toThrow(/permission denied/);
  });
  it("mismatched student/branch foreign keys are rejected, even by institution admin",async()=>{
    await expect(asUser(1,actionInsert(30,21))).rejects.toThrow(/foreign key/);
  });
  it("clients cannot write computed risk scores",async()=>{
    await expect(asUser(1,"delete from public.risk_snapshots")).rejects.toThrow(/permission denied/);
  });
});

describe("roster import boundaries", () => {
  const write = (branch: number, code: string) =>
    `insert into public.students(organization_id,branch_id,external_id,name)
     values ('${id(10)}','${id(branch)}','${code}','Aktarılan')`;

  it("institution admin writes into every branch it administers", async () => {
    await expect(asUser(1, write(20, "IMP1"))).resolves.toBeDefined();
    await expect(asUser(1, write(21, "IMP2"))).resolves.toBeDefined();
  });
  it("branch manager writes only into its own branch", async () => {
    await expect(asUser(2, write(20, "IMP3"))).resolves.toBeDefined();
    await expect(asUser(2, write(21, "IMP4"))).rejects.toThrow();
  });
  it("teacher never creates students", async () => {
    await expect(asUser(3, write(20, "IMP5"))).rejects.toThrow();
  });
  it("nobody moves a student to another institution", async () => {
    await expect(asUser(1,
      `update public.students set organization_id = '${id(11)}' where external_id = 'IMP1'`
    )).rejects.toThrow();
  });
  it("only managers record an import", async () => {
    const batch = (n: number) =>
      `insert into public.import_batches(organization_id,filename,row_count,created_count,updated_count)
       values ('${id(10)}','roster-${n}.csv',1,1,0)`;
    await expect(asUser(1, batch(1))).resolves.toBeDefined();
    await expect(asUser(3, batch(3))).rejects.toThrow();
  });
});

describe("risk scoring boundaries", () => {
  const snapshot = (n: number) =>
    `insert into public.risk_snapshots(organization_id,branch_id,student_id,period_end,
       engine_version,risk_score,risk_score_raw,risk_level,dimensions,reasons,recommended_action)
     values ('${id(10)}','${id(20)}','${id(30)}','2026-09-0${n}','v0.4',50,50,'MEDIUM','{}','[]','x')`;

  it("institution admin writes scores", async () => {
    await expect(asUser(1, snapshot(1))).resolves.toBeDefined();
  });
  it("branch manager does not, because a branch cannot calibrate itself", async () => {
    await expect(asUser(2, snapshot(2))).rejects.toThrow();
  });
  it("teacher does not", async () => {
    await expect(asUser(3, snapshot(3))).rejects.toThrow();
  });
});

describe("day-to-day entry boundaries", () => {
  const measurement = (student: number, source: string) =>
    `insert into public.student_measurements(organization_id,branch_id,student_id,measured_on,kind,value,source_reference)
     values ('${id(10)}','${id(20)}','${id(student)}','2026-09-08','exam',72,'${source}')`;

  it("teacher records a mark for a student assigned to them", async () => {
    await expect(asUser(3, measurement(30, "entry-assigned"))).resolves.toBeDefined();
  });
  it("teacher cannot record one for a student in their branch they do not teach", async () => {
    await expect(asUser(3, measurement(31, "entry-unassigned"))).rejects.toThrow();
  });
  it("branch manager records for any student in their branch", async () => {
    await expect(asUser(2, measurement(31, "entry-manager"))).resolves.toBeDefined();
  });
  it("viewer records nothing", async () => {
    await expect(asUser(4, measurement(30, "entry-viewer"))).rejects.toThrow();
  });
  it("teacher corrects their own entry", async () => {
    await expect(asUser(3,
      `update public.student_measurements set value = 80
       where student_id = '${id(30)}' and source_reference = 'entry-assigned'`
    )).resolves.toBeDefined();
  });
});

describe("team management boundaries", () => {
  const grant = (org: number, user: number, role: string, branch: string) =>
    `insert into public.memberships(user_id,organization_id,branch_id,role,display_name)
     values ('${id(user)}','${id(org)}',${branch},'${role}','Yeni Kişi')`;

  it("institution admin sees the whole team, a teacher only itself", async () => {
    expect((await asUser(1, "select * from public.memberships")).rows.length).toBeGreaterThan(1);
    expect((await asUser(3, "select * from public.memberships")).rows).toHaveLength(1);
  });
  it("institution admin grants access inside its own institution", async () => {
    await expect(asUser(1, grant(10, 6, "teacher", `'${id(20)}'`))).resolves.toBeDefined();
  });
  it("nobody grants access to another institution", async () => {
    await expect(asUser(1, grant(11, 6, "teacher", `'${id(22)}'`))).rejects.toThrow();
  });
  it("a teacher grants nothing", async () => {
    await expect(asUser(3, grant(10, 6, "org_admin", "null"))).rejects.toThrow();
  });
  // The two guards fail differently: a USING clause filters the row away, so the
  // delete reports nothing deleted, while a WITH CHECK clause rejects the new row
  // outright. Both leave the administrator in place, which is what matters.
  it("an administrator cannot revoke its own access", async () => {
    expect((await asUser(1,
      `delete from public.memberships where user_id = '${id(1)}'`)).affectedRows).toBe(0);
  });
  it("an administrator cannot demote itself", async () => {
    await expect(asUser(1,
      `update public.memberships set role = 'viewer' where user_id = '${id(1)}'`
    )).rejects.toThrow(/row-level security/);
    expect((await asUser(1,
      `select role from public.memberships where user_id = '${id(1)}'`)).rows)
      .toEqual([{ role: "org_admin" }]);
  });
  it("but can revoke somebody else's", async () => {
    expect((await asUser(1,
      `delete from public.memberships where user_id = '${id(4)}'`)).affectedRows).toBe(1);
  });
});

describe("institution settings boundaries", () => {
  const write = (org: number) =>
    `insert into public.organization_settings(organization_id,pass_mark,attendance_floor,levels)
     values ('${id(org)}',70,80,array['A1','A2','B1','B2','C1'])`;

  it("only an institution admin sets them, because they rescore every branch at once", async () => {
    await expect(asUser(2, write(10))).rejects.toThrow(/row-level security/);
    await expect(asUser(1, write(10))).resolves.toBeDefined();
  });
  it("everybody in the institution reads them: the screens spell the values out", async () => {
    expect((await asUser(3, "select pass_mark from public.organization_settings")).rows)
      .toEqual([{ pass_mark: 70 }]);
  });
  it("a branch manager cannot amend them", async () => {
    expect((await asUser(2, "update public.organization_settings set pass_mark = 50")).affectedRows).toBe(0);
    expect((await asUser(1, "select pass_mark from public.organization_settings")).rows)
      .toEqual([{ pass_mark: 70 }]);
  });
  it("another institution neither reads nor writes them", async () => {
    expect((await asUser(5, "select * from public.organization_settings")).rows).toHaveLength(0);
    await expect(asUser(5, write(10))).rejects.toThrow(/row-level security/);
  });
  it("a level list cannot be empty or contain a blank name", async () => {
    await expect(asUser(1,
      "update public.organization_settings set levels = array[]::text[]")).rejects.toThrow(/levels_are_named/);
    await expect(asUser(1,
      "update public.organization_settings set levels = array['A1','']")).rejects.toThrow(/levels_are_named/);
  });
  // The column used to enumerate the five levels the demo happened to use, which
  // turned "our courses are called something else" into a schema change.
  it("accepts a level name the demo never used", async () => {
    await expect(asUser(1,
      `insert into public.enrollments(organization_id,branch_id,student_id,level,starts_on)
       values ('${id(10)}','${id(21)}','${id(32)}','Starter','2026-09-01')`)).resolves.toBeDefined();
  });
});
