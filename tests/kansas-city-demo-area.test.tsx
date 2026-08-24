import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateDemoAreaAssignment } from "../lib/demo-scheduling/area-planning";
import { DEMO_DURATION_MINUTES } from "../lib/demo-scheduling/types";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260815021349_add_kansas_city_demo_service_area.sql");
const originalAreaMigration = source("supabase/migrations/20260815011728_add_demo_area_planning.sql");
const admin = source("app/admin/demo-scheduling/page.tsx");
const server = source("lib/demo-scheduling/server.ts");
const publicAvailability = source("app/api/demo-scheduling/availability/route.ts");
const publicRequests = source("app/api/demo-scheduling/requests/route.ts");

const cityRows = [...migration.matchAll(/\('((?:[^']|'')+)', '(MO|KS)', (\d+)\)/g)].map((match) => ({
  name: match[1].replaceAll("''", "'"),
  state: match[2],
  sortOrder: Number(match[3]),
}));

test("Kansas City Metro is seeded active as the fourteenth region", () => {
  assert.match(migration, /values \('Kansas City Metro \/ Western Missouri', true, 140\)/);
  assert.match(migration, /set name = 'Kansas City Metro \/ Western Missouri',[\s\S]*active = true,[\s\S]*sort_order = 140/);
  assert.doesNotMatch(originalAreaMigration, /Kansas City Metro \/ Western Missouri/);
});

test("Kansas City migration seeds all twenty optional city choices", () => {
  assert.equal(cityRows.length, 20);
  assert.equal(cityRows.filter((city) => city.state === "MO").length, 13);
  assert.equal(cityRows.filter((city) => city.state === "KS").length, 7);
  assert.deepEqual(cityRows.map((city) => city.sortOrder), Array.from({ length: 20 }, (_, index) => (index + 1) * 10));
});

test("Kansas City Missouri and Kansas remain distinct by state abbreviation", () => {
  assert.deepEqual(cityRows.filter((city) => city.name === "Kansas City").map((city) => city.state).sort(), ["KS", "MO"]);
  assert.match(originalAreaMigration, /demo_service_area_cities_region_name_state_unique[\s\S]*region_id,[\s\S]*lower\(name\),[\s\S]*coalesce\(state_abbreviation, ''\)/);
});

test("new seeds are duplicate-safe under existing case-insensitive uniqueness", () => {
  assert.match(migration, /where lower\(name\) = lower\('Kansas City Metro \/ Western Missouri'\)/);
  assert.equal((migration.match(/on conflict do nothing/g) ?? []).length, 2);
  assert.match(originalAreaMigration, /demo_service_areas_name_unique[\s\S]*lower\(name\)/);
});

test("Specific City stays optional for a Kansas City region-only Day Plan", () => {
  const parsed = validateDemoAreaAssignment({
    serviceDate: "2026-09-01",
    regionId: "10000000-0000-4000-8000-000000000014",
    cityId: null,
    customCity: null,
    internalNote: null,
  });
  assert.equal(parsed.ok, true);
  assert.match(originalAreaMigration, /city_id uuid,/);
  assert.doesNotMatch(originalAreaMigration, /city_id uuid not null/);
});

test("dynamic admin loading needs no Kansas City application hardcoding", () => {
  assert.match(server, /from\("demo_service_areas"\)\.select/);
  assert.match(server, /from\("demo_service_area_cities"\)\.select/);
  assert.doesNotMatch(admin, /Kansas City Metro \/ Western Missouri/);
  assert.doesNotMatch(source("lib/demo-scheduling/types.ts"), /Kansas City Metro \/ Western Missouri/);
});

test("four-hour scheduling is unchanged by the Kansas City migration", () => {
  assert.equal(DEMO_DURATION_MINUTES, 240);
  assert.doesNotMatch(migration, /demo_settings|duration_minutes|demo_requests|demo_availability/i);
});

test("Kansas City planning uses the sanitized availability helper only", () => {
  assert.match(publicAvailability, /getPublicDemoAreaPlanning/);
  assert.doesNotMatch(publicAvailability, /internal_note|internalNote|readAdminScheduling/);
  assert.doesNotMatch(publicRequests, /demo_service_areas|demo_service_area_cities|demo_area_assignments|internal_note|areaPlanning/);
  assert.doesNotMatch(migration, /grant|create policy/i);
});

test("Kansas City migration changes only existing area-planning seed tables", () => {
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/);
  assert.match(migration, /insert into public\.demo_service_areas/);
  assert.match(migration, /insert into public\.demo_service_area_cities/);
  assert.doesNotMatch(migration, /create table|alter table|drop table|delete from|truncate/i);
});
