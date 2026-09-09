import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { configureDisposableDatabase, assertDatabase } from "../installation-cash-db/guards";
import { PsqlConnection, literal as q, jsonLiteral as j } from "../installation-cash-db/psql";
import { EMPTY_WORK_SHEET, calculateInvoice } from "../../lib/service/policy";
import type { WorkSheet } from "../../lib/service/types";

async function main() {
  const manifest = JSON.parse(fs.readFileSync("node_modules/.cache/ids-remote-service/database.json", "utf8"));
  assert.match(manifest.database, /^ids_installation_cash_review_20260907_remote_\d{3}$/);
  configureDisposableDatabase(manifest.database);
  const migration = "20260909011843_remote_support_and_service.sql";
  assert.equal(createHash("sha256").update(fs.readFileSync(`supabase/migrations/${migration}`)).digest("hex"), manifest.migrationHashes[migration], "Run a fresh feature rehearsal after a migration edit.");
  const connections = Array.from({ length: 3 }, () => new PsqlConnection(manifest.endpoint, manifest.container, manifest.database, process.env));
  const [db, parallel, other] = connections;
  for (const c of connections) assertDatabase(await c.json("select json_build_object('database',current_database(),'oid',(select oid from pg_database where datname=current_database()),'role',current_user,'sessionRole',session_user,'version',current_setting('server_version_num')::integer)"), manifest.database, manifest.oid);
  const passed: string[] = [];
  const check = async (name: string, run: () => Promise<void>) => { await run(); passed.push(name); console.log(`PASS ${name}`); };
  const staff = randomUUID(), secondStaff = randomUUID();
  const hash = () => createHash("sha256").update(randomUUID()).digest("hex");
  const action = async (id: string, name: string, data: unknown = {}, actor: string | null = null, key = randomUUID(), version?: number, connection = db) => {
    const v = version ?? Number(await db.query(`select version from service_cases where id=${q(id)}`));
    return connection.json(`select ids_service_action(${actor ? q(actor) : "null"},${q(id)},${q(name)},${q(key)},${v},${j(data)})`);
  };
  let phoneCounter = 1000;
  const subscription = async () => {
    const phone = `555000${phoneCounter++}`;
    const customer = await db.query(`insert into checkout_private.customers(name,email,phone) values('Synthetic customer','support-${randomUUID()}@example.invalid',${q(phone)}) returning id`);
    const id = await db.query(`insert into remote_support_subscriptions(customer_id,source,livemode,manage_token_hash,stripe_customer_id,stripe_subscription_id) values(${q(customer)},'standalone',false,${q(hash())},${q(`cus_${randomUUID()}`)},${q(`sub_${randomUUID()}`)}) returning id`);
    const s = await db.json<{ stripe_customer_id: string; stripe_subscription_id: string }>(`select row_to_json(s) from remote_support_subscriptions s where id=${q(id)}`);
    await db.query(`select ids_support_paid_cycle(${q(id)},${q(`evt_${randomUUID()}`)},${q(`in_${randomUUID()}`)},${q(s.stripe_customer_id)},${q(s.stripe_subscription_id)},'pm_synthetic',false,now()-interval '1 day',now()-interval '1 day',now()+interval '29 days')`);
    return { id, phone, customer, ...s };
  };
  const intake = async (kind: string, phone: string, warranty = "no") => {
    const token = hash();
    const result = await db.json<{ id: string }>(`select ids_service_intake(${q(randomUUID())},${q(hash())},${q(token)},${j({ kind, name: "Synthetic Customer", phone, email: kind === "included_support" ? null : "service@example.invalid", issue: "Synthetic troubleshooting issue", warranty, equipment: { manufacturer: "Test manufacturer", model: "Test model", serial: "SYNTHETIC", purchaseDate: "2026-01", purchasedFrom: "Test dealer" } })})`);
    await action(result.id, "assign", { staffId: staff });
    return { ...result, token };
  };
  try {
    await db.query(`insert into service_staff(id,name,email,phone) values(${q(staff)},'Synthetic Technician A',${q(`tech-${staff}@example.invalid`)},'5550000001'),(${q(secondStaff)},'Synthetic Technician B',${q(`tech-${secondStaff}@example.invalid`)},'5550000002')`);
    await check("RLS and function grants deny anonymous/customer roles", async () => {
      for (const role of ["anon", "authenticated"]) {
        await other.query(`set role ${role}`);
        assert.notEqual((await other.raw("select * from service_cases")).code, "00000");
        assert.notEqual((await other.raw("select ids_service_read(null,null)")).code, "00000");
        await other.query("reset role");
      }
    });
    const sub = await subscription(); const c = await intake("included_support", sub.phone);
    await check("request, assignment, reading and notes consume no sessions or invoice", async () => {
      await action(c.id, "note", { notes: "Initial note" }, staff);
      await db.query(`select ids_service_read(${q(staff)},${q(c.id)})`);
      assert.equal(await db.query(`select count(*) from remote_support_sessions s join remote_support_cycles cy on cy.id=s.cycle_id where cy.subscription_id=${q(sub.id)} and s.status='consumed'`), "0");
      assert.equal(await db.query(`select count(*) from service_invoices where case_id=${q(c.id)}`), "0");
    });
    await check("concurrent duplicate Start Session consumes exactly one", async () => {
      const version = Number(await db.query(`select version from service_cases where id=${q(c.id)}`)); const key = randomUUID();
      const results = await Promise.all([action(c.id, "start_session", {}, staff, key, version, db), action(c.id, "start_session", {}, staff, key, version, parallel)]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(await db.query(`select count(*) from remote_support_sessions where case_id=${q(c.id)} and status='consumed'`), "1");
    });
    await check("handoff and repeated start days later retain one issue/session", async () => {
      await action(c.id, "assign", { staffId: secondStaff });
      await assert.rejects(action(c.id, "note", { notes: "Unauthorized old assignment" }, staff));
      await action(c.id, "start_session", {}, secondStaff);
      assert.equal(await db.query(`select count(*) from remote_support_sessions where case_id=${q(c.id)} and status='consumed'`), "1");
      await assert.rejects(action(c.id, "resolve", { notes: "" }, secondStaff));
      await action(c.id, "resolve", { notes: "Issue resolved after several conversations." }, secondStaff);
      assert.equal(await db.query(`select status from service_cases where id=${q(c.id)}`), "resolved");
    });
    await check("disabled staff loses access; historical attribution remains", async () => {
      await db.query(`update service_staff set enabled=false where id=${q(secondStaff)}`);
      await assert.rejects(db.query(`select ids_service_read(${q(secondStaff)},${q(c.id)})`));
      assert.ok(Number(await db.query(`select count(*) from service_case_events where case_id=${q(c.id)} and actor_name='Synthetic Technician B'`)) > 0);
      await db.query(`update service_staff set enabled=true where id=${q(secondStaff)}`);
    });
    await check("at least ten independent technicians plus existing Master Admin", async () => {
      for (let n = 0; n < 10; n++) await db.query(`insert into service_staff(name,email,phone) values('Synthetic additional technician',${q(`staff-${randomUUID()}@example.invalid`)},'5550009999')`);
      assert.ok(Number(await db.query("select count(*) from service_staff")) >= 12);
      await db.query("select ids_service_read(null,null)");
    });
    await check("suspension removes discount/start and pauses scheduled appointment; paid recovery restores", async () => {
      const requested = await intake("included_support", sub.phone);
      await action(requested.id, "schedule", { startsAt: new Date(Date.now() + 3_600_000).toISOString(), endsAt: new Date(Date.now() + 7_200_000).toISOString() });
      const invoice = `in_${randomUUID()}`;
      await db.query(`select ids_support_state(${q(sub.id)},false,${q(sub.stripe_subscription_id)},'suspended',${q(invoice)},now(),false)`);
      assert.equal(await db.query(`select ids_support_eligible(${q(sub.customer)})`), "f");
      await assert.rejects(action(requested.id, "start_session", {}, staff));
      assert.equal(await db.query(`select status from service_appointments where case_id=${q(requested.id)}`), "paused");
      await db.query(`select ids_support_paid_cycle(${q(sub.id)},${q(`evt_${randomUUID()}`)},${q(invoice)},${q(sub.stripe_customer_id)},${q(sub.stripe_subscription_id)},'pm_synthetic',false,now(),now()+interval '29 days',now()+interval '59 days')`);
      assert.equal(await db.query(`select ids_support_eligible(${q(sub.customer)})`), "t");
      assert.equal(await db.query(`select status from service_appointments where case_id=${q(requested.id)}`), "scheduled");
    });
    await check("appointment cancellation exact 24-hour boundary and late reschedule numbering", async () => {
      const s = await subscription(); const c = await intake("included_support", s.phone);
      await db.query("begin");
      const times = await db.json<{ starts: string; ends: string }>("select json_build_object('starts',now()+interval '24 hours','ends',now()+interval '25 hours')");
      await action(c.id, "schedule", { startsAt: times.starts, endsAt: times.ends });
      const appointment = await db.query(`select id from service_appointments where case_id=${q(c.id)}`);
      await action(c.id, "cancel_appointment", { appointmentId: appointment, notes: "Exactly 24 hours" });
      assert.equal(await db.query(`select count(*) from remote_support_sessions where case_id=${q(c.id)} and status='consumed'`), "0");
      await db.query("commit");
      await action(c.id, "schedule", { startsAt: new Date(Date.now() + 12 * 3_600_000).toISOString(), endsAt: new Date(Date.now() + 13 * 3_600_000).toISOString() });
      const late = await db.query(`select id from service_appointments where case_id=${q(c.id)} and status='scheduled'`);
      await action(c.id, "cancel_appointment", { appointmentId: late, notes: "Late cancellation" });
      await action(c.id, "schedule", { startsAt: new Date(Date.now() + 14 * 3_600_000).toISOString(), endsAt: new Date(Date.now() + 15 * 3_600_000).toISOString() });
      assert.equal(await db.query(`select session_number from service_appointments where case_id=${q(c.id)} and status='scheduled'`), "2");
    });
    await check("Session 4 no-show is duplicate safe and carries into next cycle Session 1", async () => {
      const s = await subscription();
      await db.query(`update remote_support_sessions set status='consumed',consumed_at=now(),reason='synthetic_prior_session' where cycle_id in(select id from remote_support_cycles where subscription_id=${q(s.id)}) and number<4`);
      const c = await intake("included_support", s.phone);
      const cycle = await db.query(`select id from remote_support_cycles where subscription_id=${q(s.id)}`);
      const appointment = await db.query(`insert into service_appointments(case_id,staff_id,starts_at,ends_at,cycle_id,session_number) values(${q(c.id)},${q(staff)},now()-interval '2 hours',now()-interval '1 hour',${q(cycle)},4) returning id`);
      await db.query(`update remote_support_sessions set status='reserved',case_id=${q(c.id)},appointment_id=${q(appointment)} where cycle_id=${q(cycle)} and number=4`);
      await action(c.id, "no_show", { appointmentId: appointment, notes: "Customer did not attend" }, staff);
      await action(c.id, "no_show", { appointmentId: appointment, notes: "Repeated delivery" }, staff);
      assert.equal(await db.query(`select count(*) from remote_support_penalties where subscription_id=${q(s.id)}`), "1");
      await db.query(`select ids_support_paid_cycle(${q(s.id)},${q(`evt_${randomUUID()}`)},${q(`in_${randomUUID()}`)},${q(s.stripe_customer_id)},${q(s.stripe_subscription_id)},'pm_synthetic',false,now(),now()+interval '29 days',now()+interval '59 days')`);
      assert.equal(await db.query(`select applied_number from remote_support_penalties where subscription_id=${q(s.id)}`), "1");
      assert.equal(await db.query(`select count(*) from remote_support_sessions ss join remote_support_cycles cy on cy.id=ss.cycle_id where cy.subscription_id=${q(s.id)} and cy.starts_at>now() and ss.status='available'`), "3");
    });
    await check("attachment reservations enforce a case-wide concurrent limit of three", async () => {
      const c = await intake("included_support", sub.phone);
      const reserve = (connection: PsqlConnection) => connection.query(`select ids_service_attachment_reserve(${q(staff)},${q(c.id)},${q(randomUUID())},'synthetic.png','image/png',100)`);
      await Promise.all([reserve(db), reserve(parallel), reserve(other)]);
      await assert.rejects(reserve(db));
      await assert.rejects(db.query(`select ids_service_attachment_reserve(${q(secondStaff)},${q(c.id)},${q(randomUUID())},'synthetic.png','image/png',100)`));
    });
    await check("warranty verification, single work sheet, zero due, final-only report outbox", async () => {
      const c = await intake("onsite_service", "5550019999", "unsure");
      assert.equal(await db.query(`select arrangement from service_cases where id=${q(c.id)}`), "shop_dropoff");
      await assert.rejects(action(c.id, "begin_service", { notes: "Not yet verified" }, staff));
      await assert.rejects(action(c.id, "warranty_review", { equipmentCovered: true, serviceCovered: true, arrangement: "shop_dropoff", notes: "Covered" }, staff));
      await action(c.id, "warranty_review", { equipmentCovered: true, serviceCovered: true, arrangement: "shop_dropoff", notes: "Manufacturer confirms equipment and this repair are covered." });
      await action(c.id, "begin_service", { notes: "Customer dropped off; technical work actually begins." }, staff);
      const sheet: WorkSheet = { ...structuredClone(EMPTY_WORK_SHEET), diagnosis: "Failed test component", workPerformed: "Replaced component", testing: "Passed operation test", resolution: "Repaired", labor: [{ id: randomUUID(), date: "2026-09-08", minutes: 120, description: "Repair", technicianId: staff }], supplies: [{ id: randomUUID(), kind: "material", description: "Repair material", partNumber: "", quantity: 1, unitCents: 1800, authorization: "Covered repair" }] };
      await assert.rejects(action(c.id, "save_invoice", { sheet: { ...sheet, travel: [{ id: randomUUID(), date: "2026-09-09", category: "initial", outboundMinutes: 90, returnMinutes: 90, mappedRoute: "Synthetic", reason: "Invalid drop-off travel" }] } }, staff), /dropoff_has_no_travel/);
      await action(c.id, "save_invoice", { sheet }, staff);
      await action(c.id, "resolve", { notes: "Equipment repaired and tested." }, staff);
      assert.equal(await db.query(`select count(*) from service_outbox where case_id=${q(c.id)} and kind='warranty_report'`), "0");
      await action(c.id, "submit_invoice", { sheet }, staff);
      await assert.rejects(action(c.id, "finalize_invoice", {}, staff));
      await action(c.id, "finalize_invoice");
      assert.deepEqual(await db.json(`select totals from service_invoices where case_id=${q(c.id)}`), calculateInvoice(sheet, { remote: false, warranty: true, subscriberEligible: false }));
      assert.equal(await db.query(`select count(*) from service_outbox where case_id=${q(c.id)} and kind='warranty_report'`), "1");
      assert.equal(await db.query(`select count(*) from service_payments where case_id=${q(c.id)}`), "0");
      await assert.rejects(action(c.id, "save_invoice", { sheet }));
      const snapshot = await db.json(`select report_snapshot from service_invoices where case_id=${q(c.id)}`);
      assert.ok(snapshot);
      await assert.rejects(action(c.id, "resolve", { notes: "Attempt to rewrite a final report" }, staff));
      assert.deepEqual(await db.json(`select report_snapshot from service_invoices where case_id=${q(c.id)}`), snapshot);
    });
    await check("standard no-show consumes scheduled Session 1 and next Session 2 only once", async () => {
      const s = await subscription(); const c = await intake("included_support", s.phone);
      const cycle = await db.query(`select id from remote_support_cycles where subscription_id=${q(s.id)}`);
      const appointment = await db.query(`insert into service_appointments(case_id,staff_id,starts_at,ends_at,cycle_id,session_number) values(${q(c.id)},${q(staff)},now()-interval '4 hours',now()-interval '3 hours',${q(cycle)},1) returning id`);
      await db.query(`update remote_support_sessions set status='reserved',case_id=${q(c.id)},appointment_id=${q(appointment)} where cycle_id=${q(cycle)} and number=1`);
      await action(c.id, "no_show", { appointmentId: appointment, notes: "Verified no-show" }, staff);
      await action(c.id, "no_show", { appointmentId: appointment, notes: "Repeated observation" }, staff);
      assert.deepEqual(await db.json(`select json_agg(number order by number) from remote_support_sessions where cycle_id=${q(cycle)} and status='consumed'`), [1, 2]);
      assert.equal(await db.query(`select count(*) from remote_support_penalties where subscription_id=${q(s.id)}`), "0");
    });
    await check("outbox concurrency, expired lease, delayed retry and sent/review records prevent duplicate delivery", async () => {
      const id = await db.query("select id from service_outbox where kind='warranty_report' limit 1");
      const claim = async (connection = db) => (await connection.json<{ job: { attempts: number; first_attempt_at: string } | null }>(`select json_build_object('job',ids_service_outbox_claim(${q(id)}))`)).job;
      const claims = await Promise.all([claim(), claim(parallel)]); assert.equal(claims.filter(Boolean).length, 1);
      const first = claims.find(Boolean)!; assert.equal(first.attempts, 1); assert.equal(await claim(), null);
      await db.query(`update service_outbox set leased_at=now()-interval '6 minutes' where id=${q(id)}`);
      const recovered = (await claim())!; assert.equal(recovered.attempts, 2); assert.equal(recovered.first_attempt_at, first.first_attempt_at);
      await db.query(`update service_outbox set status='failed',available_at=now()+interval '1 hour' where id=${q(id)}`); assert.equal(await claim(), null);
      for (const status of ["sent", "needs_review"]) { await db.query(`update service_outbox set status=${q(status)},available_at=now() where id=${q(id)}`); assert.equal(await claim(), null); }
    });
    await check("customer cancellation preserves the shared rule with exactly one correctly attributed history event", async () => {
      const s = await subscription(), c = await intake("included_support", s.phone);
      await action(c.id, "schedule", { startsAt: new Date(Date.now() + 10 * 86400000).toISOString(), endsAt: new Date(Date.now() + 10 * 86400000 + 3600000).toISOString() });
      const appointment = await db.query(`select id from service_appointments where case_id=${q(c.id)}`), key = randomUUID(), data = { appointmentId: appointment };
      await assert.rejects(db.query(`select ids_service_customer_action(${q(hash())},'cancel_appointment',${q(key)},${j(data)})`));
      const cancel = () => db.query(`select ids_service_customer_action(${q(c.token)},'cancel_appointment',${q(key)},${j(data)})`);
      await cancel(); await cancel();
      assert.equal(await db.query(`select count(*) from service_case_events where case_id=${q(c.id)} and action='cancel_appointment'`), "1");
      assert.equal(await db.query(`select actor_name from service_case_events where case_id=${q(c.id)} and action='cancel_appointment'`), "Customer");
      assert.equal(await db.query(`select count(*) from remote_support_sessions where case_id=${q(c.id)} and status='consumed'`), "0");
    });
    await check("follow-up on a started issue retains its original session and no-show adds one penalty", async () => {
      const s = await subscription(); const c = await intake("included_support", s.phone);
      await action(c.id, "start_session", {}, staff);
      await action(c.id, "schedule", { startsAt: new Date(Date.now() + 20 * 3_600_000).toISOString(), endsAt: new Date(Date.now() + 21 * 3_600_000).toISOString() });
      const appointment = await db.query(`select id from service_appointments where case_id=${q(c.id)} and status='scheduled'`);
      assert.equal(await db.query(`select session_number from service_appointments where id=${q(appointment)}`), "1");
      assert.equal(await db.query(`select status from remote_support_sessions where case_id=${q(c.id)}`), "consumed");
      await db.query(`update service_appointments set starts_at=now()-interval '6 hours',ends_at=now()-interval '5 hours' where id=${q(appointment)}`);
      await action(c.id, "no_show", { appointmentId: appointment, notes: "Follow-up missed" }, staff);
      assert.equal(await db.query(`select count(*) from remote_support_sessions ss join remote_support_cycles cy on cy.id=ss.cycle_id where cy.subscription_id=${q(s.id)} and ss.status='consumed'`), "2");
      await action(c.id, "start_session", {}, staff);
      assert.equal(await db.query(`select count(*) from remote_support_sessions where case_id=${q(c.id)} and reason='started'`), "1");
    });
    await check("Session 4 penalty applies immediately when the next paid cycle already exists", async () => {
      const s = await subscription(); const c = await intake("included_support", s.phone);
      const cycle = await db.query(`select id from remote_support_cycles where subscription_id=${q(s.id)}`);
      await db.query(`update remote_support_sessions set status='consumed',consumed_at=now(),reason='synthetic_prior_session' where cycle_id=${q(cycle)} and number<4`);
      await db.query(`select ids_support_paid_cycle(${q(s.id)},${q(`evt_${randomUUID()}`)},${q(`in_${randomUUID()}`)},${q(s.stripe_customer_id)},${q(s.stripe_subscription_id)},'pm_synthetic',false,now(),now()+interval '29 days',now()+interval '59 days')`);
      const appointment = await db.query(`insert into service_appointments(case_id,staff_id,starts_at,ends_at,cycle_id,session_number) values(${q(c.id)},${q(staff)},now()-interval '8 hours',now()-interval '7 hours',${q(cycle)},4) returning id`);
      await db.query(`update remote_support_sessions set status='reserved',case_id=${q(c.id)},appointment_id=${q(appointment)} where cycle_id=${q(cycle)} and number=4`);
      await action(c.id, "no_show", { appointmentId: appointment, notes: "Next cycle was already paid" }, staff);
      assert.equal(await db.query(`select applied_number from remote_support_penalties where subscription_id=${q(s.id)}`), "1");
    });
    await check("unverified failure timing suspends access without inventing a fourteen-day clock", async () => {
      const s = await subscription();
      await db.query(`select ids_support_state(${q(s.id)},false,${q(s.stripe_subscription_id)},'suspended',${q(`in_${randomUUID()}`)},null,false)`);
      assert.equal(await db.query(`select status||':'||(failed_at is null)::text from remote_support_subscriptions where id=${q(s.id)}`), "suspended:true");
      assert.equal(await db.query(`select ids_support_eligible(${q(s.customer)})`), "f");
    });
    await check("failure recovery after fourteen days cannot revive subscription benefits", async () => {
      const s = await subscription(); const invoice = `in_${randomUUID()}`;
      await db.query(`select ids_support_state(${q(s.id)},false,${q(s.stripe_subscription_id)},'suspended',${q(invoice)},now()-interval '14 days 1 second',false)`);
      const result = await db.json<{ reviewRequired: boolean }>(`select ids_support_paid_cycle(${q(s.id)},${q(`evt_${randomUUID()}`)},${q(invoice)},${q(s.stripe_customer_id)},${q(s.stripe_subscription_id)},'pm_synthetic',false,now(),now(),now()+interval '1 month')`);
      assert.equal(result.reviewRequired, true);
      assert.equal(await db.query(`select count(*) from service_financial_reconciliations where subscription_id=${q(s.id)} and reason='late_subscription_payment'`), "1");
      assert.equal(await db.query(`select ids_support_eligible(${q(s.customer)})`), "f");
    });
    await check("not-covered warranty requires customer choice and a saved authorization before paid work", async () => {
      const c = await intake("onsite_service", "5550020001", "yes");
      await action(c.id, "warranty_review", { equipmentCovered: true, serviceCovered: false, arrangement: "shop_dropoff", notes: "Requested work is excluded by manufacturer." });
      await assert.rejects(action(c.id, "begin_service", { notes: "No customer decision yet" }, staff));
      await db.query(`select ids_service_customer_action(${q(c.token)},'authorize_paid',${q(randomUUID())},'{"decision":"proceed"}')`);
      assert.equal(await db.query(`select kind from service_cases where id=${q(c.id)}`), "onsite_service");
      await assert.rejects(action(c.id, "begin_service", { notes: "No saved payment method yet" }, staff));
      assert.equal(await db.query(`select count(*) from service_payments where case_id=${q(c.id)}`), "0");
    });
    await check("paid invoice remains one sheet through holds, handoff, review and explicit cash collection", async () => {
      const c = await intake("remote_service", "5550020002");
      const authorization = await db.json<{ id: string }>(`select ids_service_payment_reserve(null,${q(c.id)},${q(randomUUID())},'setup',false,null,null,true)`);
      const customer = `cus_${randomUUID()}`;
      await db.query(`select ids_service_payment_apply(${q(authorization.id)},${q(`evt_${randomUUID()}`)},'succeeded',false,${q(customer)},${q(`seti_${randomUUID()}`)},${q(`cs_${randomUUID()}`)},0,'usd','pm_synthetic')`);
      await action(c.id, "begin_service", { notes: "Actual remote diagnosis begins." }, staff);
      const sheet: WorkSheet = { ...structuredClone(EMPTY_WORK_SHEET), diagnosis: "Settings issue", workPerformed: "Reconfigured", testing: "Tested", resolution: "Resolved", labor: [{ id: randomUUID(), date: "2026-09-08", minutes: 35, description: "Diagnosis", technicianId: staff }] };
      await action(c.id, "save_invoice", { sheet }, staff);
      await action(c.id, "hold", { reason: "waiting_manufacturer_parts", notes: "Waiting for response; no labor accrues." }, staff);
      await action(c.id, "assign", { staffId: secondStaff });
      await action(c.id, "resume", { notes: "Manufacturer replied; work resumes." }, secondStaff);
      sheet.labor.push({ id: randomUUID(), date: "2026-09-09", minutes: 30, description: "Configuration and testing", technicianId: secondStaff });
      await action(c.id, "submit_invoice", { sheet }, secondStaff);
      await action(c.id, "return_invoice", { notes: "Clarify testing." });
      sheet.testing = "Verified manufacturer parameters and operation";
      await action(c.id, "submit_invoice", { sheet }, secondStaff);
      await action(c.id, "resolve", { notes: sheet.resolution }, secondStaff);
      await action(c.id, "finalize_invoice");
      assert.equal(await db.query(`select totals->>'customerDueCents' from service_invoices where case_id=${q(c.id)}`), "12000");
      assert.equal(await db.query(`select count(*) from service_invoices where case_id=${q(c.id)}`), "1");
      assert.equal(await db.query(`select count(*) from service_payments where case_id=${q(c.id)} and purpose='invoice'`), "0");
      const reserve = (key: string, actor = secondStaff) => db.json(`select ids_service_payment_reserve(${q(actor)},${q(c.id)},${q(key)},'cash',false,'SYNTHETIC-RECEIPT','Cash physically received')`);
      await assert.rejects(reserve(randomUUID()));
      await db.query(`update service_staff set can_record_cash=true where id=${q(secondStaff)}`);
      const key = randomUUID(); const receipt = await reserve(key);
      assert.deepEqual(await reserve(key), receipt);
      await assert.rejects(reserve(randomUUID()));
      assert.equal(await db.query(`select payment_status from service_invoices where case_id=${q(c.id)}`), "paid_cash");
      assert.equal(await db.query(`select status from service_cases where id=${q(c.id)}`), "resolved");
    });
    await check("Setup eligibility requires both private links and follows the canonical paid subscription", async () => {
      const s = await subscription();
      await db.query("update demo_availability_rules set enabled=true,start_time='08:00',end_time='16:00'");
      const installation = await db.json<{ id: string; token: string }>(`insert into installations(customer_name,customer_email,customer_phone,property_address,internet_availability,requested_start_at,requested_end_at,grounding_acknowledged_at,responsibilities_acknowledged_at,terms_acknowledged_at,idempotency_key,status) values('Synthetic Setup owner','setup@example.invalid','5550099999','Synthetic address','yes',(select start_at from public.ids_list_installation_slots(current_date,current_date+30) limit 1),(select end_at from public.ids_list_installation_slots(current_date,current_date+30) limit 1),now(),now(),now(),${q(randomUUID())},'completed') returning json_build_object('id',id,'token',public_token)`);
      const manageHash = await db.query(`select manage_token_hash from remote_support_subscriptions where id=${q(s.id)}`);
      await assert.rejects(db.query(`select ids_support_bind_installation(${q(hash())},${q(installation.token)})`));
      await assert.rejects(db.query(`select ids_support_bind_installation(${q(manageHash)},${q(randomUUID())})`));
      assert.equal(await db.query(`select count(*) from service_installation_customers where installation_id=${q(installation.id)}`), "0");
      const bind = () => db.json<{ linked: boolean; eligible: boolean }>(`select ids_support_bind_installation(${q(manageHash)},${q(installation.token)})`);
      assert.deepEqual(await bind(), { linked: true, eligible: true });
      assert.deepEqual(await bind(), { linked: true, eligible: true });
      await db.query(`select ids_support_state(${q(s.id)},false,${q(s.stripe_subscription_id)},'suspended','in_binding_failure',now(),false)`);
      assert.deepEqual(await bind(), { linked: true, eligible: false });
      assert.equal(await db.query(`select count(*) from service_installation_customers where installation_id=${q(installation.id)}`), "1");
    });
    await check("field Service blocks Demo and Installation in both directions and public slot availability", async () => {
      const slot = await db.json<{ start: string; end: string }>("select json_build_object('start',start_at,'end',end_at) from ids_list_installation_slots(current_date+3,current_date+30) limit 1");
      const c = await intake("onsite_service", "5550020091");
      const appointment = () => db.query(`insert into service_appointments(case_id,staff_id,starts_at,ends_at) values(${q(c.id)},${q(staff)},${q(slot.start)},${q(slot.end)}) returning id`);
      const createDemo = () => db.query(`insert into demo_requests(customer_name,customer_email,customer_phone,property_address,requested_start_at,requested_end_at,duration_minutes,source,idempotency_key) values('Synthetic calendar','calendar@example.invalid','5550020092','Synthetic property',${q(slot.start)},${q(slot.end)},${(Date.parse(slot.end) - Date.parse(slot.start)) / 60000},'featured_lymow',${q(randomUUID())}) returning id`);
      const createInstallation = () => db.query(`insert into installations(customer_name,customer_email,customer_phone,property_address,internet_availability,requested_start_at,requested_end_at,grounding_acknowledged_at,responsibilities_acknowledged_at,terms_acknowledged_at,idempotency_key) values('Synthetic calendar','calendar@example.invalid','5550020093','Synthetic property','yes',${q(slot.start)},${q(slot.end)},now(),now(),now(),${q(randomUUID())}) returning id`);
      const a = await appointment();
      assert.equal(await db.query(`select ids_installation_slot_available(${q(slot.start)},${q(slot.end)})`), "f");
      assert.equal(await db.query(`select count(*) from ids_service_field_occupancy(${q(slot.start)},${q(slot.end)})`), "1");
      await assert.rejects(createDemo()); await assert.rejects(createInstallation());
      await db.query(`update service_appointments set status='cancelled' where id=${q(a)}`);
      assert.equal(await db.query(`select ids_installation_slot_available(${q(slot.start)},${q(slot.end)})`), "t");
      const demo = await createDemo(); await assert.rejects(appointment());
      await db.query(`update demo_requests set status='cancelled',cancelled_at=now() where id=${q(demo)}`);
      const installation = await createInstallation(); await assert.rejects(appointment());
      await db.query(`update installations set status='cancelled' where id=${q(installation)}`);
      await appointment();
    });
    await check("partial/full refunds, disputes and stale payment notifications preserve frozen accounting and technical status", async () => {
      const c = await intake("remote_service", "5550020094");
      const authorization = await db.json<{ id: string }>(`select ids_service_payment_reserve(null,${q(c.id)},${q(randomUUID())},'setup',false,null,null,true)`);
      const customer = `cus_${randomUUID()}`, intent = `pi_${randomUUID()}`;
      await db.query(`select ids_service_payment_apply(${q(authorization.id)},${q(`evt_${randomUUID()}`)},'succeeded',false,${q(customer)},${q(`seti_${randomUUID()}`)},${q(`cs_${randomUUID()}`)},0,'usd','pm_synthetic')`);
      await action(c.id, "begin_service", { notes: "Synthetic active work" }, staff);
      const sheet: WorkSheet = { ...structuredClone(EMPTY_WORK_SHEET), diagnosis: "Synthetic", workPerformed: "Repaired", testing: "Passed", resolution: "Resolved", labor: [{ id: randomUUID(), date: "2026-09-09", minutes: 65, description: "Repair", technicianId: staff }] };
      await action(c.id, "submit_invoice", { sheet }, staff); await action(c.id, "resolve", { notes: sheet.resolution }, staff); await action(c.id, "finalize_invoice");
      const payment = await db.json<{ id: string }>(`select ids_service_payment_reserve(null,${q(c.id)},${q(randomUUID())},'card',false,null,null)`);
      const apply = (status: string) => db.query(`select ids_service_payment_apply(${q(payment.id)},${q(`evt_${randomUUID()}`)},${q(status)},false,${q(customer)},${q(intent)},null,12000,'usd',null)`);
      await apply("succeeded"); const object = `ch_${randomUUID()}`;
      const financial = (amount: number, review = false) => db.query(`select ids_service_financial_reconcile(${q(payment.id)},false,${q(object)},${q(`evt_${randomUUID()}`)},false,${q(customer)},${q(intent)},12000,${amount},${review},${j({ amount, review })})`);
      for (const [amount, review, status] of [[3000, false, "partially_refunded"], [3000, true, "payment_review"], [3000, false, "partially_refunded"], [12000, false, "refunded"]] as const) {
        await financial(amount, review); const history = await db.query(`select count(*) from service_case_events where case_id=${q(c.id)} and action='financial_adjustment'`); await financial(amount, review);
        assert.equal(await db.query(`select count(*) from service_case_events where case_id=${q(c.id)} and action='financial_adjustment'`), history);
        await apply("failed"); await apply("succeeded");
        assert.equal(await db.query(`select payment_status from service_invoices where case_id=${q(c.id)}`), status);
        await assert.rejects(db.query(`select ids_service_payment_reserve(null,${q(c.id)},${q(randomUUID())},'card',false,null,null)`));
      }
      assert.equal(await db.query(`select status||':'||(select status from service_invoices where case_id=c.id)||':'||(select totals->>'customerDueCents' from service_invoices where case_id=c.id) from service_cases c where id=${q(c.id)}`), "resolved:finalized:12000");
      assert.equal(await db.query(`select count(*) from service_financial_reconciliations where payment_id=${q(payment.id)}`), "1");
    });
    for (const method of ["card", "ach_debit", "wire_transfer"]) await check(`machine ${method} optional charges, retry and delayed activation`, async () => {
      const product = await db.json<{ id: string; slug: string; name: string }>("select json_build_object('id',id,'slug',slug,'name',name) from catalog_products where slug='lymow-one-plus'");
      const equipment = 269900; const discount = method === "card" ? 0 : 7422; const support = method !== "wire_transfer"; const amount = support ? 10000 : 0;
      const line = { itemType: "product", sourceId: product.id, sku: null, name: product.name, description: null, quantity: 1, unitAmountCents: equipment, extendedAmountCents: equipment, includedInPackagePrice: false, parentSourceId: null };
      const snapshot = { currency: "usd", product, variant: null, purchaseMode: "standard", chargeableItems: [line, ...(support ? [{ ...line, itemType: "fee", sourceId: "ids-remote-support-v1", sku: "IDS-REMOTE-SUPPORT", name: "IDS Remote Support", unitAmountCents: amount, extendedAmountCents: amount }] : [])], includedPackageComponents: [], subtotalCents: equipment + amount, discountCents: discount, feeCents: 0, shippingCents: 0, taxCents: 0, totalCents: equipment - discount + amount, paymentMethod: method, pricedAt: new Date().toISOString(), catalogSources: [], warnings: [], safeMetadata: { phase: "4B2B", discountPolicy: method === "card" ? "none" : "ids_ach_2_75_percent" }, optionalServices: { install: true, setup: true, remoteSupport: support, acceptedSupportTerms: support } };
      const key = randomUUID(), fingerprint = hash(), token = hash();
      const customer = { name: "Synthetic machine buyer", email: `machine-${key}@example.invalid`, phone: `555000${phoneCounter++}`, shippingAddress: { line1: "Synthetic street", line2: null, city: "Synthetic town", state: "MO", postalCode: "63967", country: "US" } };
      const draft = () => db.json<{ orderId: string; attemptId: string; snapshot: typeof snapshot }>(`select ids_service_machine_checkout_draft(${q(`machine:${key}`)},${q(fingerprint)},${q(key)},${j(customer)},${j(snapshot)},null,false,${q(token)},'http://127.0.0.1:3058')`);
      const first = await draft(); const repeat = await draft();
      assert.equal(repeat.orderId, first.orderId); assert.deepEqual(repeat.snapshot, snapshot);
      assert.equal(await db.query(`select total_cents from checkout_private.orders where id=${q(first.orderId)}`), String(snapshot.totalCents));
      assert.equal(await db.query(`select count(*) from checkout_private.order_items where order_id=${q(first.orderId)} and item_type='fee'`), support ? "1" : "0");
      assert.equal(await db.query(`select count(*) from remote_support_subscriptions where order_id=${q(first.orderId)}`), support ? "1" : "0");
      if (support) {
        const sub = await db.query(`select id from remote_support_subscriptions where order_id=${q(first.orderId)}`);
        const cid = await db.query(`select customer_id from remote_support_subscriptions where id=${q(sub)}`);
        assert.equal(await db.query(`select ids_support_eligible(${q(cid)})`), "f");
        await db.query(`update checkout_private.orders set payment_status='paid',paid_at=now() where id=${q(first.orderId)}`);
        assert.equal(await db.query(`select count(*) from service_outbox where subscription_id=${q(sub)} and kind='machine_subscription'`), "1");
        await db.query(`select ids_support_paid_cycle(${q(sub)},${q(`machine-paid:${first.orderId}`)},${q(`machine:${first.orderId}`)},${q(`cus_${key}`)},null,'pm_synthetic',false,now(),now()+interval '10 days',now()+interval '10 days 1 month')`);
        assert.equal(await db.query(`select status from remote_support_subscriptions where id=${q(sub)}`), "pending_activation");
        assert.equal(await db.query(`select ids_support_eligible(${q(cid)})`), "f");
        assert.equal(await db.query(`select count(*) from remote_support_sessions ss join remote_support_cycles cy on cy.id=ss.cycle_id where cy.subscription_id=${q(sub)}`), "4");
        assert.equal(await db.query(`select activation_at>=paid_at+interval '10 days' from remote_support_subscriptions s join remote_support_cycles cy on cy.subscription_id=s.id where s.id=${q(sub)}`), "t");
      }
    });
    await check("Master pricing changes are versioned, validated and preserve existing invoice snapshots", async () => {
      const before = await db.query("select count(*) from service_invoices where pricing->>'firstHourCents'='8000'");
      const pricing = { firstHourCents: 9000, additionalHalfHourCents: 4000, initialTravelHalfHourCents: 1750, returnTravelHalfHourCents: 500, hazardTravelHalfHourCents: 1750, warrantyHourlyCents: 8000 };
      await assert.rejects(db.query(`select ids_service_save_pricing(${q(staff)},${q(randomUUID())},1,${j(pricing)},'Unauthorized')`));
      await db.query(`select ids_service_save_pricing(null,${q(randomUUID())},1,${j(pricing)},'Synthetic future-rate verification')`);
      assert.equal(await db.query("select version from service_pricing_settings where id"), "2");
      assert.equal(await db.query("select count(*) from service_invoices where pricing->>'firstHourCents'='8000'"), before);
      await assert.rejects(db.query(`select ids_service_save_pricing(null,${q(randomUUID())},1,${j(pricing)},'Stale revision')`));
    });
    fs.writeFileSync("node_modules/.cache/ids-remote-service/database-results.json", JSON.stringify({ database: manifest.database, passed }, null, 2));
    console.log(`${passed.length} real PostgreSQL scenarios passed.`);
  } finally { connections.forEach(c => c.close()); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
