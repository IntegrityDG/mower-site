import {
  isDemoAreaIdentifier,
  isDemoServiceDate,
  validateDemoAreaAssignment,
  validateDemoServiceArea,
  validateDemoServiceAreaCity,
} from "./area-planning";
import type {
  DemoAreaAssignment,
  DemoAreaAssignmentInput,
  DemoServiceArea,
  DemoServiceAreaCity,
  DemoServiceAreaCityInput,
  DemoServiceAreaInput,
} from "./types";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const unauthorized = () => json({ error: "Unauthorized" }, 401);

function operationError(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : "";
  if (code === "region_not_found") return json({ error: "Area / Region was not found." }, 404);
  if (code === "city_not_found") return json({ error: "Specific City was not found." }, 404);
  if (code === "inactive_region") return json({ error: "Inactive regions cannot be used for a new day assignment." }, 409);
  if (code === "inactive_city") return json({ error: "Inactive cities cannot be used for a new day assignment." }, 409);
  if (code === "city_region_mismatch") return json({ error: "The selected city does not belong to the selected region." }, 400);
  if (code === "reserved_area") return json({ error: "Custom / Out-of-Area is reserved and cannot be edited." }, 409);
  return json({ error: fallback }, 409);
}

type AuthDependency = { isAdmin: () => Promise<boolean> };

export function createDemoAreaAssignmentHandlers(dependencies: AuthDependency & {
  save: (value: DemoAreaAssignmentInput) => Promise<DemoAreaAssignment>;
}) {
  return {
    async PUT(request: Request) {
      if (!(await dependencies.isAdmin())) return unauthorized();
      const parsed = validateDemoAreaAssignment(await request.json().catch(() => null));
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      try { return json({ assignment: await dependencies.save(parsed.value) }); }
      catch (error) { return operationError(error, "Day Plan could not be saved."); }
    },
  };
}

export function createDemoAreaAssignmentItemHandlers(dependencies: AuthDependency & {
  clear: (serviceDate: string) => Promise<void>;
}) {
  return {
    async DELETE(serviceDate: string) {
      if (!(await dependencies.isAdmin())) return unauthorized();
      if (!isDemoServiceDate(serviceDate)) return json({ error: "Choose a valid service date." }, 400);
      try { await dependencies.clear(serviceDate); return new Response(null, { status: 204 }); }
      catch (error) { return operationError(error, "Day Plan could not be cleared."); }
    },
  };
}

export function createDemoServiceAreaHandlers(dependencies: AuthDependency & {
  save: (value: DemoServiceAreaInput, id?: string) => Promise<DemoServiceArea>;
}) {
  return {
    async POST(request: Request) {
      if (!(await dependencies.isAdmin())) return unauthorized();
      const parsed = validateDemoServiceArea(await request.json().catch(() => null));
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      try { return json({ area: await dependencies.save(parsed.value) }, 201); }
      catch (error) { return operationError(error, "Area / Region could not be created."); }
    },
    async PATCH(request: Request, id: string) {
      if (!(await dependencies.isAdmin())) return unauthorized();
      if (!isDemoAreaIdentifier(id)) return json({ error: "Invalid Area / Region identifier." }, 400);
      const parsed = validateDemoServiceArea(await request.json().catch(() => null));
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      try { return json({ area: await dependencies.save(parsed.value, id) }); }
      catch (error) { return operationError(error, "Area / Region could not be updated."); }
    },
  };
}

export function createDemoServiceAreaCityHandlers(dependencies: AuthDependency & {
  save: (regionId: string, value: DemoServiceAreaCityInput, id?: string) => Promise<DemoServiceAreaCity>;
}) {
  return {
    async POST(request: Request, regionId: string) {
      if (!(await dependencies.isAdmin())) return unauthorized();
      if (!isDemoAreaIdentifier(regionId)) return json({ error: "Invalid Area / Region identifier." }, 400);
      const parsed = validateDemoServiceAreaCity(await request.json().catch(() => null));
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      try { return json({ city: await dependencies.save(regionId, parsed.value) }, 201); }
      catch (error) { return operationError(error, "City could not be created."); }
    },
    async PATCH(request: Request, regionId: string, cityId: string) {
      if (!(await dependencies.isAdmin())) return unauthorized();
      if (!isDemoAreaIdentifier(regionId) || !isDemoAreaIdentifier(cityId)) return json({ error: "Invalid city identifier." }, 400);
      const parsed = validateDemoServiceAreaCity(await request.json().catch(() => null));
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      try { return json({ city: await dependencies.save(regionId, parsed.value, cityId) }); }
      catch (error) { return operationError(error, "City could not be updated."); }
    },
  };
}
