import Link from "next/link";
import type { DemoSource } from "@/lib/demo-scheduling/types";

export default function ScheduleDemoModal({
  source,
  triggerClassName = "inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-700 px-4 py-3 text-center font-black text-emerald-800 hover:bg-emerald-50",
}: {
  source: DemoSource;
  triggerClassName?: string;
}) {
  return <Link href={`/services-scheduling?service=demo&source=${encodeURIComponent(source)}#request-demo`} className={triggerClassName}>Schedule Service/Demo</Link>;
}
