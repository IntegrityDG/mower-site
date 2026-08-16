alter table public.dealer_network_troubleshooting_entries
  add column publicly_published boolean not null default false;

alter table public.dealer_network_troubleshooting_photos
  add column publicly_visible boolean not null default false;

alter table public.dealer_network_troubleshooting_entries
  add constraint dealer_network_troubleshooting_publication_requires_approval
  check (not publicly_published or status = 'approved');

create index dealer_network_troubleshooting_public_entries_idx
  on public.dealer_network_troubleshooting_entries (issue_date desc, id)
  where status = 'approved' and publicly_published = true;

create index dealer_network_troubleshooting_public_photos_idx
  on public.dealer_network_troubleshooting_photos (entry_id, photo_kind, position)
  where publicly_visible = true;

create function public.dealer_network_stop_unapproved_publication()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'approved' then
    new.publicly_published := false;
  end if;
  return new;
end;
$$;

create trigger dealer_network_stop_unapproved_publication
before insert or update of status, publicly_published
on public.dealer_network_troubleshooting_entries
for each row
execute function public.dealer_network_stop_unapproved_publication();

revoke all on function public.dealer_network_stop_unapproved_publication()
  from public, anon, authenticated, service_role;
