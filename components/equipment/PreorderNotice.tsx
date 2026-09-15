import { preorderCustomerNotice } from "@/lib/catalog/preorder";
import type { CatalogVariant } from "@/lib/catalog/types";

export default function PreorderNotice({ core }: { core: CatalogVariant | null }) {
  const notice = core ? preorderCustomerNotice(core) : null;
  return notice ? <p role="note" className="mt-4 rounded-xl border border-violet-300 bg-violet-50 p-4 text-sm font-semibold leading-6 text-violet-950">{notice}</p> : null;
}
