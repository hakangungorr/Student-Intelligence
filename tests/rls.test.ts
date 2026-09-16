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

describe("assessment boundaries", () => {
  const assess = (student: number, on: string) =>
    `insert into public.skill_assessments(organization_id,branch_id,student_id,assessed_on,
       skill,task_label,rubric_version)
     values ('${id(10)}','${id(20)}','${id(student)}','${on}','speaking','Kısa anlatım','pilot-taslak-v1')`;

  it("teacher measures a student assigned to them", async () => {
    await expect(asUser(3, assess(30, "2026-09-10"))).resolves.toBeDefined();
  });
  it("teacher cannot measure a student they do not teach", async () => {
    await expect(asUser(3, assess(31, "2026-09-10"))).rejects.toThrow(/row-level security/);
  });
  // A measurement is what somebody observed on a day. A mistake is answered with
  // a new measurement, never by rewriting the evidence a plan was built on.
  it("nobody edits a measurement after the fact", async () => {
    await expect(asUser(1,
      "update public.skill_assessments set task_label = 'başka görev'")).rejects.toThrow(/permission denied/);
  });
  it("another institution sees no measurements", async () => {
    expect((await asUser(5, "select * from public.skill_assessments")).rows).toHaveLength(0);
  });
});

describe("one open plan per student", () => {
  const open = (student: number, tasks = "[]") =>
    `select public.open_plan('${id(student)}','2026-09-23',120::smallint,null,'${tasks}'::jsonb) as plan`;
  const staff = JSON.stringify([
    { kind: "staff", title: "Eğitmenle görüşme", why: "Sınav notları düşüyor", owner: "teacher", source_key: "staff:gorusme" },
    { kind: "measure", title: "İlk ölçümü yap", why: "Tarihli ölçüm yok", owner: "teacher", source_key: "measure" }
  ]);
  let planId = "";

  it("teacher opens a plan for their own student, with its first tasks in one step", async () => {
    const r = await asUser(3, open(30, staff));
    planId = (r.rows[0] as { plan: string }).plan;
    expect((await asUser(3,
      `select count(*)::int as n from public.plan_tasks where plan_id = '${planId}'`)).rows)
      .toEqual([{ n: 2 }]);
  });
  // The student is invisible to them, so the function cannot even find it —
  // which is better than a refusal: it does not confirm the student exists.
  it("teacher cannot open one for a student they do not teach", async () => {
    await expect(asUser(3, open(31))).rejects.toThrow(/Öğrenci bulunamadı/);
  });
  // The rule the whole design rests on.
  it("a second open plan for the same student is refused", async () => {
    await expect(asUser(2, open(30))).rejects.toThrow(/plans_one_open/);
  });
  it("a failed task rolls the whole plan back", async () => {
    const bad = JSON.stringify([{ kind: "work", title: "", why: "x" }]);
    await expect(asUser(2, open(31, bad))).rejects.toThrow();
    expect((await asUser(2,
      `select count(*)::int as n from public.plans where student_id = '${id(31)}'`)).rows)
      .toEqual([{ n: 0 }]);
  });
  it("the same suggestion cannot be added twice", async () => {
    await expect(asUser(3,
      `select public.add_plan_task('${planId}','{"kind":"measure","title":"Tekrar","why":"x","source_key":"measure"}'::jsonb)`))
      .rejects.toThrow(/plan_tasks_once/);
  });

  // Done work is part of what happened; only untouched work can be taken back.
  it("an untouched task can be removed, a done one cannot", async () => {
    await asUser(3, `update public.plan_tasks set status = 'done' where plan_id = '${planId}' and kind = 'staff'`);
    expect((await asUser(3,
      `delete from public.plan_tasks where plan_id = '${planId}' and kind = 'staff'`)).affectedRows).toBe(0);
    expect((await asUser(3,
      `delete from public.plan_tasks where plan_id = '${planId}' and kind = 'measure'`)).affectedRows).toBe(1);
  });
  it("every change is in the history, written by the database", async () => {
    expect((await asUser(3,
      `select kind from public.plan_events where plan_id = '${planId}' order by id`)).rows.map(r => (r as { kind: string }).kind))
      .toEqual(["opened", "added", "added", "done", "removed"]);
  });
  it("the history cannot be written by hand", async () => {
    await expect(asUser(1,
      `insert into public.plan_events(plan_id,organization_id,branch_id,student_id,kind)
       values ('${planId}','${id(10)}','${id(20)}','${id(30)}','done')`)).rejects.toThrow(/permission denied/);
  });
  it("a plan cannot be closed without saying who and when", async () => {
    await expect(asUser(3,
      `update public.plans set status = 'closed' where id = '${planId}'`)).rejects.toThrow(/closed_plan_says_when/);
  });
  it("a closed plan takes no new tasks, and a new one can be opened", async () => {
    await asUser(3, `update public.plans set status = 'closed', closed_at = now(),
      closed_by = '${id(3)}', close_note = 'Kontrol ölçümü yapıldı' where id = '${planId}'`);
    await expect(asUser(3,
      `select public.add_plan_task('${planId}','{"title":"Geç","why":"x"}'::jsonb)`)).rejects.toThrow(/Kapalı/);
    await expect(asUser(3, open(30))).resolves.toBeDefined();
  });
  it("another institution sees no plans", async () => {
    expect((await asUser(5, "select * from public.plans")).rows).toHaveLength(0);
    expect((await asUser(5, "select * from public.plan_events")).rows).toHaveLength(0);
  });
});

describe("library and seats", () => {
  const eventId = id(40);
  it("only an institution admin adds a study", async () => {
    const study = `insert into public.library_items(organization_id,kind,title,minutes)
      values ('${id(10)}','study','Hedef yapı hazırlığı',15)`;
    await expect(asUser(1, study)).resolves.toBeDefined();
    await expect(asUser(3, study)).rejects.toThrow(/row-level security/);
  });
  it("an event needs a time, a place and a capacity", async () => {
    await expect(asUser(2, `insert into public.library_items(organization_id,branch_id,kind,title,minutes)
      values ('${id(10)}','${id(20)}','event','Eksik etkinlik',30)`)).rejects.toThrow(/event_has_time_place_and_room/);
  });
  it("a branch manager schedules an event in its own branch, not another", async () => {
    const event = (branch: number, eid: string) => `insert into public.library_items(id,organization_id,branch_id,kind,
      program,title,minutes,starts_at,capacity)
      values ('${eid}','${id(10)}','${id(branch)}','event','guided_practice','Konuşma etkinliği',30,
      '2026-09-17 18:00+03',1)`;
    await expect(asUser(2, event(20, eventId))).resolves.toBeDefined();
    await expect(asUser(2, event(21, id(41)))).rejects.toThrow(/row-level security/);
  });

  const addEvent = (plan: string) =>
    `select public.add_plan_task('${plan}','{"title":"Konuşma etkinliği","why":"Akıcılık geride","library_item_id":"${eventId}"}'::jsonb)`;
  const planOf = async (user: number, student: number) => {
    const existing = await asUser(user,
      `select id from public.plans where student_id = '${id(student)}' and status = 'open'`);
    if (existing.rows.length) return (existing.rows[0] as { id: string }).id;
    const r = await asUser(user,
      `select public.open_plan('${id(student)}','2026-09-23',120::smallint,null,'[]'::jsonb) as plan`);
    return (r.rows[0] as { plan: string }).plan;
  };

  it("adding an event to a plan takes the seat", async () => {
    const plan = await planOf(2, 30);
    await expect(asUser(2, addEvent(plan))).resolves.toBeDefined();
    expect((await asUser(2,
      `select count(*)::int as n from public.library_bookings where item_id = '${eventId}'`)).rows)
      .toEqual([{ n: 1 }]);
  });
  // Nobody appears to be going to an event there was no room at.
  it("a full event cannot be added, and the task that asked for it is not left behind", async () => {
    const plan = await planOf(2, 31);
    await expect(asUser(2, addEvent(plan))).rejects.toThrow(/yer kalmadı/);
    expect((await asUser(2,
      `select count(*)::int as n from public.plan_tasks where plan_id = '${plan}'`)).rows)
      .toEqual([{ n: 0 }]);
  });
  it("a seat cannot be released on its own while the plan still lists the event", async () => {
    await expect(asUser(2, "delete from public.library_bookings")).rejects.toThrow(/permission denied/);
  });
  it("removing the untouched task gives the seat back", async () => {
    const plan = await planOf(2, 30);
    await asUser(2, `delete from public.plan_tasks where plan_id = '${plan}' and library_item_id = '${eventId}'`);
    expect((await asUser(2,
      `select count(*)::int as n from public.library_bookings where item_id = '${eventId}'`)).rows)
      .toEqual([{ n: 0 }]);
  });
  it("another institution reads none of the library", async () => {
    expect((await asUser(5, "select * from public.library_items")).rows).toHaveLength(0);
  });
});

describe("measurement history", () => {
  it("an overwritten reading is kept, not lost", async () => {
    await asUser(2,
      `insert into public.student_measurements(organization_id,branch_id,student_id,measured_on,kind,value,source_reference)
       values ('${id(10)}','${id(20)}','${id(31)}','2026-09-01','exam',55,'history-exam')`);
    await asUser(2,
      `update public.student_measurements set value = 71, measured_on = '2026-10-01'
       where student_id = '${id(31)}' and source_reference = 'history-exam'`);
    expect((await asUser(2,
      `select previous_value::int as v, previous_measured_on::text as d
       from public.measurement_revisions where source_reference = 'history-exam'`)).rows)
      .toEqual([{ v: 55, d: "2026-09-01" }]);
  });
  it("the history is read-only to the application", async () => {
    await expect(asUser(1,
      `insert into public.measurement_revisions(measurement_id,organization_id,branch_id,student_id,
         kind,source_reference,previous_value,previous_measured_on)
       values ('${id(30)}','${id(10)}','${id(20)}','${id(31)}','exam','fake',1,'2026-09-01')`))
      .rejects.toThrow(/permission denied/);
  });
});

describe("one row per recommended task", () => {
  const close = (task: string) =>
    `insert into public.actions(organization_id,branch_id,student_id,title,period_end,task_key,status)
     values ('${id(10)}','${id(20)}','${id(30)}','Görev','2026-09-08','${task}','completed')`;

  it("two different tasks in one recommendation are two rows", async () => {
    await expect(asUser(2, close("egitmenle-gorusme"))).resolves.toBeDefined();
    await expect(asUser(2, close("ogrenci-iliskileri-aramasi"))).resolves.toBeDefined();
  });
  // Two clicks, or the same task closed from the agenda and the card at once.
  it("the same task cannot be closed twice", async () => {
    await expect(asUser(2, close("egitmenle-gorusme"))).rejects.toThrow(/actions_one_per_task/);
  });
  it("which task a closed row answers cannot be moved afterwards", async () => {
    await expect(asUser(2,
      "update public.actions set task_key = 'baska-gorev'")).rejects.toThrow(/permission denied/);
  });
});
