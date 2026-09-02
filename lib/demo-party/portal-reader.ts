import { hashPortalToken, portalTokenIsWellFormed } from "./security";
import { demoPartyPortalFromRpc } from "./portal-payload";
import type { DemoPartyPortal } from "./types";

export { demoPartyGuestFromRpc, demoPartyPortalFromRpc } from "./portal-payload";

type PortalRpcResult = { data: unknown; error: unknown };
type PortalRpc = (tokenHash: string) => PromiseLike<PortalRpcResult>;

export async function readDemoPartyPortalWithRpc(rawToken: string, rpc: PortalRpc): Promise<DemoPartyPortal | null> {
  if (!portalTokenIsWellFormed(rawToken)) return null;
  const result = await rpc(hashPortalToken(rawToken));
  if (result.error) throw result.error;
  return result.data ? demoPartyPortalFromRpc(result.data) : null;
}
