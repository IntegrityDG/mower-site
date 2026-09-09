import { serviceApiError, serviceBody, serviceResponse } from "@/lib/service/api";
import { createServiceCase } from "@/lib/service/server";
import { wakeServiceMaintenance } from "@/lib/service/outbox";
export const runtime = "nodejs";
export async function POST(request: Request) { try { const result = await createServiceCase(request, await serviceBody(request)); wakeServiceMaintenance(); return serviceResponse(result, 201); } catch (error) { return serviceApiError(error); } }
