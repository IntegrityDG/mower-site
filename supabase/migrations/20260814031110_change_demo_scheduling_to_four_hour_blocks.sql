begin;

alter table public.demo_settings
  drop constraint demo_settings_duration_minutes_check,
  alter column duration_minutes set default 240;

update public.demo_settings
set duration_minutes = 240,
    updated_at = now()
where id = true;

alter table public.demo_settings
  add constraint demo_settings_duration_minutes_check
    check (duration_minutes = 240);

commit;
