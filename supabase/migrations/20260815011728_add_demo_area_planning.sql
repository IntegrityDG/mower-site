begin;

create table public.demo_service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index demo_service_areas_name_unique
  on public.demo_service_areas (lower(name));
create index demo_service_areas_active_sort_idx
  on public.demo_service_areas (active, sort_order, name);

create table public.demo_service_area_cities (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.demo_service_areas(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  state_abbreviation text check (
    state_abbreviation is null
    or state_abbreviation ~ '^[A-Z]{2}$'
  ),
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, region_id)
);

create unique index demo_service_area_cities_region_name_state_unique
  on public.demo_service_area_cities (
    region_id,
    lower(name),
    coalesce(state_abbreviation, '')
  );
create index demo_service_area_cities_region_active_sort_idx
  on public.demo_service_area_cities (region_id, active, sort_order, name);

create table public.demo_area_assignments (
  id uuid primary key default gen_random_uuid(),
  service_date date not null unique,
  region_id uuid not null references public.demo_service_areas(id) on delete restrict,
  city_id uuid,
  custom_city text check (custom_city is null or char_length(custom_city) between 1 and 120),
  internal_note text check (internal_note is null or char_length(internal_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_area_assignments_city_region_fkey
    foreign key (city_id, region_id)
    references public.demo_service_area_cities(id, region_id)
    on delete restrict,
  constraint demo_area_assignments_city_choice_check
    check (city_id is null or custom_city is null)
);

create index demo_area_assignments_region_idx
  on public.demo_area_assignments (region_id);
create index demo_area_assignments_city_idx
  on public.demo_area_assignments (city_id)
  where city_id is not null;

alter table public.demo_service_areas enable row level security;
alter table public.demo_service_area_cities enable row level security;
alter table public.demo_area_assignments enable row level security;

revoke all on table
  public.demo_service_areas,
  public.demo_service_area_cities,
  public.demo_area_assignments
from public, anon, authenticated, service_role;

grant select, insert, update
  on table public.demo_service_areas, public.demo_service_area_cities
  to service_role;
grant select, insert, update, delete
  on table public.demo_area_assignments
  to service_role;

insert into public.demo_service_areas (name, sort_order)
values
  ('St. Louis Metro / Eastern Missouri', 10),
  ('Cape Girardeau Area', 20),
  ('Sikeston / Bootheel', 30),
  ('Poplar Bluff Area', 40),
  ('West Plains Area', 50),
  ('Springfield / Branson', 60),
  ('Joplin Area', 70),
  ('Northeastern Arkansas', 80),
  ('Northwestern Arkansas', 90),
  ('Paducah / Western Kentucky', 100),
  ('Jackson / Western Tennessee', 110),
  ('Memphis Metro', 120),
  ('Southern Illinois', 130);

insert into public.demo_service_area_cities (region_id, name, state_abbreviation, sort_order)
select area.id, seed.city_name, seed.state_abbreviation, seed.sort_order
from (
  values
    ('St. Louis Metro / Eastern Missouri', 'St. Louis', 'MO', 10),
    ('St. Louis Metro / Eastern Missouri', 'Arnold', 'MO', 20),
    ('St. Louis Metro / Eastern Missouri', 'Festus', 'MO', 30),
    ('St. Louis Metro / Eastern Missouri', 'Crystal City', 'MO', 40),
    ('St. Louis Metro / Eastern Missouri', 'Hillsboro', 'MO', 50),
    ('St. Louis Metro / Eastern Missouri', 'De Soto', 'MO', 60),
    ('St. Louis Metro / Eastern Missouri', 'Bonne Terre', 'MO', 70),
    ('St. Louis Metro / Eastern Missouri', 'Park Hills', 'MO', 80),
    ('St. Louis Metro / Eastern Missouri', 'Farmington', 'MO', 90),
    ('St. Louis Metro / Eastern Missouri', 'Ste. Genevieve', 'MO', 100),
    ('St. Louis Metro / Eastern Missouri', 'Perryville', 'MO', 110),
    ('Cape Girardeau Area', 'Cape Girardeau', 'MO', 10),
    ('Cape Girardeau Area', 'Jackson', 'MO', 20),
    ('Cape Girardeau Area', 'Scott City', 'MO', 30),
    ('Cape Girardeau Area', 'Chaffee', 'MO', 40),
    ('Cape Girardeau Area', 'Marble Hill', 'MO', 50),
    ('Cape Girardeau Area', 'Advance', 'MO', 60),
    ('Cape Girardeau Area', 'Perryville', 'MO', 70),
    ('Cape Girardeau Area', 'Ste. Genevieve', 'MO', 80),
    ('Cape Girardeau Area', 'Fredericktown', 'MO', 90),
    ('Sikeston / Bootheel', 'Sikeston', 'MO', 10),
    ('Sikeston / Bootheel', 'Charleston', 'MO', 20),
    ('Sikeston / Bootheel', 'East Prairie', 'MO', 30),
    ('Sikeston / Bootheel', 'New Madrid', 'MO', 40),
    ('Sikeston / Bootheel', 'Portageville', 'MO', 50),
    ('Sikeston / Bootheel', 'Dexter', 'MO', 60),
    ('Sikeston / Bootheel', 'Bloomfield', 'MO', 70),
    ('Sikeston / Bootheel', 'Malden', 'MO', 80),
    ('Sikeston / Bootheel', 'Kennett', 'MO', 90),
    ('Sikeston / Bootheel', 'Caruthersville', 'MO', 100),
    ('Sikeston / Bootheel', 'Hayti', 'MO', 110),
    ('Sikeston / Bootheel', 'Steele', 'MO', 120),
    ('Poplar Bluff Area', 'Poplar Bluff', 'MO', 10),
    ('Poplar Bluff Area', 'Doniphan', 'MO', 20),
    ('Poplar Bluff Area', 'Piedmont', 'MO', 30),
    ('Poplar Bluff Area', 'Van Buren', 'MO', 40),
    ('Poplar Bluff Area', 'Greenville', 'MO', 50),
    ('West Plains Area', 'West Plains', 'MO', 10),
    ('West Plains Area', 'Mountain Grove', 'MO', 20),
    ('West Plains Area', 'Willow Springs', 'MO', 30),
    ('West Plains Area', 'Houston', 'MO', 40),
    ('West Plains Area', 'Ava', 'MO', 50),
    ('Springfield / Branson', 'Springfield', 'MO', 10),
    ('Springfield / Branson', 'Ozark', 'MO', 20),
    ('Springfield / Branson', 'Nixa', 'MO', 30),
    ('Springfield / Branson', 'Republic', 'MO', 40),
    ('Springfield / Branson', 'Branson', 'MO', 50),
    ('Springfield / Branson', 'Hollister', 'MO', 60),
    ('Springfield / Branson', 'Lebanon', 'MO', 70),
    ('Joplin Area', 'Joplin', 'MO', 10),
    ('Joplin Area', 'Neosho', 'MO', 20),
    ('Joplin Area', 'Monett', 'MO', 30),
    ('Northeastern Arkansas', 'Jonesboro', 'AR', 10),
    ('Northeastern Arkansas', 'Paragould', 'AR', 20),
    ('Northeastern Arkansas', 'Pocahontas', 'AR', 30),
    ('Northeastern Arkansas', 'Walnut Ridge', 'AR', 40),
    ('Northeastern Arkansas', 'Corning', 'AR', 50),
    ('Northeastern Arkansas', 'Rector', 'AR', 60),
    ('Northeastern Arkansas', 'Blytheville', 'AR', 70),
    ('Northeastern Arkansas', 'Osceola', 'AR', 80),
    ('Northeastern Arkansas', 'Newport', 'AR', 90),
    ('Northeastern Arkansas', 'Batesville', 'AR', 100),
    ('Northeastern Arkansas', 'Mountain Home', 'AR', 110),
    ('Northwestern Arkansas', 'Harrison', 'AR', 10),
    ('Northwestern Arkansas', 'Berryville', 'AR', 20),
    ('Northwestern Arkansas', 'Eureka Springs', 'AR', 30),
    ('Northwestern Arkansas', 'Fayetteville', 'AR', 40),
    ('Northwestern Arkansas', 'Springdale', 'AR', 50),
    ('Northwestern Arkansas', 'Rogers', 'AR', 60),
    ('Northwestern Arkansas', 'Bentonville', 'AR', 70),
    ('Northwestern Arkansas', 'Bella Vista', 'AR', 80),
    ('Northwestern Arkansas', 'Huntsville', 'AR', 90),
    ('Paducah / Western Kentucky', 'Paducah', 'KY', 10),
    ('Paducah / Western Kentucky', 'Murray', 'KY', 20),
    ('Paducah / Western Kentucky', 'Mayfield', 'KY', 30),
    ('Paducah / Western Kentucky', 'Benton', 'KY', 40),
    ('Paducah / Western Kentucky', 'Calvert City', 'KY', 50),
    ('Paducah / Western Kentucky', 'Princeton', 'KY', 60),
    ('Paducah / Western Kentucky', 'Hopkinsville', 'KY', 70),
    ('Paducah / Western Kentucky', 'Cadiz', 'KY', 80),
    ('Paducah / Western Kentucky', 'Eddyville', 'KY', 90),
    ('Paducah / Western Kentucky', 'Marion', 'KY', 100),
    ('Paducah / Western Kentucky', 'Fulton', 'KY', 110),
    ('Paducah / Western Kentucky', 'Hickman', 'KY', 120),
    ('Jackson / Western Tennessee', 'Jackson', 'TN', 10),
    ('Jackson / Western Tennessee', 'Brownsville', 'TN', 20),
    ('Jackson / Western Tennessee', 'Dyersburg', 'TN', 30),
    ('Jackson / Western Tennessee', 'Ripley', 'TN', 40),
    ('Jackson / Western Tennessee', 'Covington', 'TN', 50),
    ('Jackson / Western Tennessee', 'Union City', 'TN', 60),
    ('Jackson / Western Tennessee', 'Martin', 'TN', 70),
    ('Jackson / Western Tennessee', 'Paris', 'TN', 80),
    ('Jackson / Western Tennessee', 'Humboldt', 'TN', 90),
    ('Memphis Metro', 'Memphis', 'TN', 10),
    ('Memphis Metro', 'Bartlett', 'TN', 20),
    ('Memphis Metro', 'Germantown', 'TN', 30),
    ('Memphis Metro', 'Collierville', 'TN', 40),
    ('Memphis Metro', 'Millington', 'TN', 50),
    ('Southern Illinois', 'Anna', 'IL', 10),
    ('Southern Illinois', 'Jonesboro', 'IL', 20),
    ('Southern Illinois', 'Cairo', 'IL', 30),
    ('Southern Illinois', 'Metropolis', 'IL', 40),
    ('Southern Illinois', 'Vienna', 'IL', 50),
    ('Southern Illinois', 'Carbondale', 'IL', 60),
    ('Southern Illinois', 'Murphysboro', 'IL', 70),
    ('Southern Illinois', 'Marion', 'IL', 80),
    ('Southern Illinois', 'Herrin', 'IL', 90),
    ('Southern Illinois', 'Harrisburg', 'IL', 100),
    ('Southern Illinois', 'West Frankfort', 'IL', 110),
    ('Southern Illinois', 'Benton', 'IL', 120),
    ('Southern Illinois', 'Mount Vernon', 'IL', 130),
    ('Southern Illinois', 'Chester', 'IL', 140),
    ('Southern Illinois', 'Pinckneyville', 'IL', 150),
    ('Southern Illinois', 'Du Quoin', 'IL', 160)
) as seed(region_name, city_name, state_abbreviation, sort_order)
join public.demo_service_areas area on area.name = seed.region_name;

commit;
