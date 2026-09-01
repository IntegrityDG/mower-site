import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateDemoAreaAssignment } from "../lib/demo-scheduling/area-planning";
import {
  CUSTOM_DEMO_AREA_ID,
  DEMO_REGION_MARKER_CLASSES,
  NORMAL_DEMO_REGION_COLORS,
  demoRegionColor,
  publicDemoAreaLabel,
  publicDemoAreaLegend,
  toPublicDemoAreaPlanning,
} from "../lib/demo-scheduling/public-area-planning";

const source = (path: string) => readFileSync(path, "utf8");
const normalRegionId = "10000000-0000-4000-8000-000000000014";
const cityId = "10000000-0000-4000-8000-000000000015";
const normalRows = [{ service_date: "2026-08-29", region_id: normalRegionId, city_id: cityId, custom_city: null }];
const areas = [{ id: normalRegionId, name: "Kansas City Metro / Western Missouri" }, { id: CUSTOM_DEMO_AREA_ID, name: "Custom / Out-of-Area" }];
const cities = [{ id: cityId, name: "Lee's Summit", state_abbreviation: "MO" }];

test("normal public planning is sanitized and formats saved city plus state", () => {
  const [plan] = toPublicDemoAreaPlanning(normalRows, areas, cities);
  assert.deepEqual(plan, {
    serviceDate: "2026-08-29",
    regionName: "Kansas City Metro / Western Missouri",
    locationLabel: "Lee's Summit, MO",
    color: demoRegionColor(normalRegionId),
    isCustom: false,
  });
  assert.equal(publicDemoAreaLabel(plan), "Demo Area: Kansas City Metro / Western Missouri — Lee's Summit, MO");
  assert.deepEqual(Object.keys(plan).sort(), ["color", "isCustom", "locationLabel", "regionName", "serviceDate"]);
});

test("reserved custom planning trims customCity, uses red, and shows only the actual location", () => {
  const [plan] = toPublicDemoAreaPlanning(
    [{ service_date: "2026-08-30", region_id: CUSTOM_DEMO_AREA_ID, city_id: null, custom_city: "  Nashville, TN  " }],
    areas,
    [],
  );
  assert.equal(plan.color, "red");
  assert.equal(plan.locationLabel, "Nashville, TN");
  assert.equal(publicDemoAreaLabel(plan), "Demo Area: Nashville, TN");
  assert.doesNotMatch(publicDemoAreaLabel(plan), /Custom \/ Out-of-Area —/);
});

test("normal region colors exclude red and remain deterministic across months and ranges", () => {
  assert.doesNotMatch(JSON.stringify(NORMAL_DEMO_REGION_COLORS), /red/);
  assert.notEqual(demoRegionColor(normalRegionId), "red");
  assert.equal(demoRegionColor(normalRegionId), demoRegionColor(normalRegionId));
  const august = toPublicDemoAreaPlanning(normalRows, areas, cities)[0];
  const september = toPublicDemoAreaPlanning([{ ...normalRows[0], service_date: "2026-09-12" }], areas, cities)[0];
  assert.equal(august.color, september.color);
  assert.equal(DEMO_REGION_MARKER_CLASSES.red, "bg-red-600");
});

test("month legend includes only occurring regions, deduplicates normal and custom entries", () => {
  const plans = toPublicDemoAreaPlanning([
    ...normalRows,
    { ...normalRows[0], service_date: "2026-08-30" },
    { service_date: "2026-08-31", region_id: CUSTOM_DEMO_AREA_ID, city_id: null, custom_city: "Nashville, TN" },
    { service_date: "2026-08-28", region_id: CUSTOM_DEMO_AREA_ID, city_id: null, custom_city: "Dallas, TX" },
  ], areas, cities);
  const legend = publicDemoAreaLegend(plans);
  assert.equal(legend.length, 2);
  assert.equal(legend.filter((item) => item.isCustom).length, 1);
  assert.deepEqual(legend.map((item) => item.regionName), ["Kansas City Metro / Western Missouri", "Custom / Out-of-Area"]);
  assert.equal(publicDemoAreaLegend(plans.filter((item) => !item.isCustom)).some((item) => item.color === "red"), false);
});

test("custom assignment validation requires a trimmed location and rejects saved city", () => {
  const base = { serviceDate: "2026-08-29", regionId: CUSTOM_DEMO_AREA_ID, cityId: null, customCity: " Nashville, TN ", internalNote: null };
  const parsed = validateDemoAreaAssignment(base);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, { ...base, customCity: "Nashville, TN" });
  assert.equal(validateDemoAreaAssignment({ ...base, customCity: "   " }).ok, false);
  assert.equal(validateDemoAreaAssignment({ ...base, cityId }).ok, false);
});

test("public endpoint and mapper cannot expose internal notes", () => {
  const server = source("lib/demo-scheduling/server.ts");
  const publicMapper = source("lib/demo-scheduling/public-area-planning.ts");
  const route = source("app/api/demo-scheduling/availability/route.ts");
  const publicHelper = server.slice(server.indexOf("export async function getPublicDemoAreaPlanning"), server.indexOf("export async function createDemoRequest"));
  for (const privateField of ["internalNote", "internal_note"]) {
    assert.doesNotMatch(publicHelper, new RegExp(privateField));
    assert.doesNotMatch(publicMapper, new RegExp(privateField));
    assert.doesNotMatch(route, new RegExp(privateField));
  }
  assert.match(publicHelper, /select\("service_date,region_id,city_id,custom_city"\)/);
  assert.match(publicHelper, /\.gte\("service_date",start\)\.lte\("service_date",end\)/);
  assert.doesNotMatch(route, /readAdminScheduling/);
});

test("shared public calendar keeps availability backgrounds and adds markers, legend, location, and accessible text", () => {
  const requestForm = source("components/services-scheduling/DemoRequestForm.tsx");
  const availabilityRoute = source("app/api/demo-scheduling/availability/route.ts");
  const schedulingShortcut = source("components/demo-scheduling/ScheduleDemoModal.tsx");
  assert.match(schedulingShortcut, /\/services-scheduling\?service=demo&source=\$\{encodeURIComponent\(source\)\}#request-demo/);
  assert.match(requestForm, /available \? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-100 bg-slate-100 text-slate-400"/);
  assert.match(requestForm, /DEMO_REGION_MARKER_CLASSES\[areaPlan\.color\]/);
  assert.match(requestForm, /publicDemoAreaLegend\(areaPlanning\)/);
  assert.match(requestForm, /publicDemoAreaLabel\(selectedAreaPlan\)/);
  assert.match(requestForm, /publicDemoAreaAccessibleLabel\(areaPlan\)/);
  assert.match(requestForm, /areaPlan && <span aria-hidden="true"/);
  assert.match(requestForm, /plan\.isCustom \? "Custom \/ Out-of-Area" : plan\.regionName/);
  assert.match(requestForm, /setAreaPlanning\(payload\.areaPlanning \?\? \[\]\)/);
  assert.match(availabilityRoute, /getAvailableSlots/);
  assert.match(availabilityRoute, /getPublicDemoAreaPlanning/);
  assert.match(availabilityRoute, /slots,areaPlanning/);
  assert.doesNotMatch(`${requestForm}\n${availabilityRoute}`, /internalNote|internal_note/);
});

test("reserved migration is fixed, idempotent, last-sorted, and does not alter existing regions", () => {
  const migration = source("supabase/migrations/20260823223126_add_reserved_custom_demo_area.sql");
  assert.match(migration, new RegExp(CUSTOM_DEMO_AREA_ID));
  assert.match(migration, /'Custom \/ Out-of-Area'/);
  assert.match(migration, /100000/);
  assert.match(migration, /on conflict \(id\) do nothing/);
  assert.doesNotMatch(migration, /delete from|truncate|drop table|update public\.demo_service_areas/i);
});

test("admin exposes reserved Day Plan custom location while preventing normal area management", () => {
  const admin = source("app/admin/demo-scheduling/page.tsx");
  const server = source("lib/demo-scheduling/server.ts");
  assert.match(admin, /Custom Location/);
  assert.match(admin, /Nashville, TN/);
  assert.match(admin, /required=\{customAreaSelected\}/);
  assert.match(admin, /cityId: customAreaSelected \? null/);
  assert.match(admin, /dayPlanDraft\.customCity\.trim\(\)/);
  assert.match(admin, /manageableAreas = data\.serviceAreas\.filter\(\(area\) => area\.id !== CUSTOM_DEMO_AREA_ID\)/);
  assert.match(server, /if\(id===CUSTOM_DEMO_AREA_ID\)throw new DemoAreaPlanningServerError\("reserved_area"\)/);
  assert.match(server, /if\(regionId===CUSTOM_DEMO_AREA_ID\)throw new DemoAreaPlanningServerError\("reserved_area"\)/);
  assert.match(server, /cityId:null/);
});
