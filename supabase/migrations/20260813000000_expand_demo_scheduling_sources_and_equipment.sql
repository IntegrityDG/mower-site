begin;

alter table public.demo_requests
  drop constraint demo_requests_source_check,
  add constraint demo_requests_source_check
    check (source in (
      'featured_lymow',
      'featured_yarbo',
      'featured_machines',
      'contact_ids',
      'meet_or_beat',
      'ids_in_action'
    )),
  drop constraint demo_requests_equipment_interest_check,
  add constraint demo_requests_equipment_interest_check
    check (
      equipment_interest is null
      or equipment_interest in ('Lymow One Plus', 'Yarbo Core', 'Help Me Decide')
    );

commit;
