begin;

insert into public.demo_service_areas (name, active, sort_order)
values ('Kansas City Metro / Western Missouri', true, 140)
on conflict do nothing;

update public.demo_service_areas
set name = 'Kansas City Metro / Western Missouri',
    active = true,
    sort_order = 140,
    updated_at = now()
where lower(name) = lower('Kansas City Metro / Western Missouri');

with target_region as (
  select id
  from public.demo_service_areas
  where lower(name) = lower('Kansas City Metro / Western Missouri')
  limit 1
), city_seed (name, state_abbreviation, sort_order) as (
  values
    ('Kansas City', 'MO', 10),
    ('Independence', 'MO', 20),
    ('Lee''s Summit', 'MO', 30),
    ('Blue Springs', 'MO', 40),
    ('Liberty', 'MO', 50),
    ('Gladstone', 'MO', 60),
    ('North Kansas City', 'MO', 70),
    ('Parkville', 'MO', 80),
    ('Platte City', 'MO', 90),
    ('Belton', 'MO', 100),
    ('Raymore', 'MO', 110),
    ('Grandview', 'MO', 120),
    ('Harrisonville', 'MO', 130),
    ('Kansas City', 'KS', 140),
    ('Overland Park', 'KS', 150),
    ('Olathe', 'KS', 160),
    ('Shawnee', 'KS', 170),
    ('Lenexa', 'KS', 180),
    ('Leawood', 'KS', 190),
    ('Prairie Village', 'KS', 200)
)
insert into public.demo_service_area_cities (
  region_id,
  name,
  state_abbreviation,
  active,
  sort_order
)
select target_region.id,
       city_seed.name,
       city_seed.state_abbreviation,
       true,
       city_seed.sort_order
from target_region
cross join city_seed
on conflict do nothing;

commit;
