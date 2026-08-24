begin;

insert into public.demo_service_areas (id, name, description, active, sort_order)
values (
  '10000000-0000-4000-8000-000000000099',
  'Custom / Out-of-Area',
  'Reserved application-owned option for demo locations outside configured service regions.',
  true,
  100000
)
on conflict (id) do nothing;

commit;
