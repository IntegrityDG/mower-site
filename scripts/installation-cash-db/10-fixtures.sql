-- EXPLICIT SYNTHETIC WRITES. Only in the newly created disposable database.
-- Fixed fixture IDs a100...000001 through a100...000020. No real booking/API.
begin;
-- Synthetic working windows only in this task-owned disposable database.
update public.demo_availability_rules set enabled=true,start_time='09:00',end_time='18:00';
insert into public.installations(id,public_token,customer_name,customer_email,customer_phone,
  property_address,internet_availability,requested_start_at,requested_end_at,
  grounding_acknowledged_at,responsibilities_acknowledged_at,terms_acknowledged_at,
  idempotency_key,pricing_snapshot,status,payment_status,cash_status)
select ('a1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('a2000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'SYNTHETIC CASH REVIEW','cash-review@example.invalid','000-000-0000','SYNTHETIC TEST ADDRESS',
  'yes', (((now() at time zone 'America/Chicago')::date+n)+time '09:00') at time zone 'America/Chicago',
  ((((now() at time zone 'America/Chicago')::date+n)+time '09:00') at time zone 'America/Chicago') + interval '4 hours',
  now(),now(),now(),('a3000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  '{"laborCents":80000,"materialsAllowanceCents":20000,"depositCents":25000,"includedLaborMinutes":240,"additionalLaborHourlyCents":12500,"laborIncrementMinutes":15,"undergroundPerSegmentCents":5000,"undergroundSegmentFeet":10,"includedOneWayTravelMinutes":120,"travelHourlyCents":3500}'::jsonb,
  'scheduled','partially_paid','approved'
from generate_series(1,20) n;
insert into public.installation_payments(id,installation_id,purpose,method,status,amount_cents,refunded_cents,idempotency_key,paid_at)
select ('a4000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('a1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'deposit','stripe','paid',25000,0,'synthetic-deposit-' || n, '2026-09-01T17:30:00.000Z'::timestamptz
from generate_series(1,20) n;
-- Work preservation fixture; no operational work is started.
insert into public.installation_work_sessions(id,installation_id,technician,started_at,ended_at,duration_minutes,status)
values('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'SYNTHETIC FIXTURE', '2026-09-01T17:00:00Z','2026-09-01T17:10:00Z',10,'paused');
commit;
