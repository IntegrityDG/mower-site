import { serviceControls } from "@/lib/service/controls";
export const dynamic = "force-dynamic";
export async function GET() { const controls = serviceControls(); return Response.json({ remoteSupport: controls.remoteSupport && controls.payments }, { headers: { "Cache-Control": "no-store" } }); }
