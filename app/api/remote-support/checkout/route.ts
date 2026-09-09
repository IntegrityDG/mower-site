import { serviceApiError, serviceBody, serviceResponse } from "@/lib/service/api";
import { startSupportCheckout } from "@/lib/service/stripe";
export const runtime = "nodejs";
export async function POST(request: Request) { try { return serviceResponse(await startSupportCheckout(request, await serviceBody(request))); } catch (error) { return serviceApiError(error); } }
