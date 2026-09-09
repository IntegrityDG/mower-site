import Link from "next/link";
import ContactInformationModal from "@/components/contact/ContactInformationModal";
import ScheduleDemoModal from "@/components/demo-scheduling/ScheduleDemoModal";
import EquipmentReturnPolicyModal from "@/components/policies/EquipmentReturnPolicyModal";

// Match the existing Returns & Refunds trigger's sizing and typography.
const buttonClassName = "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-center text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300";
const secondaryClassName = `${buttonClassName} border-emerald-300 text-white hover:bg-white/10`;

export default function FooterActions({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <ContactInformationModal triggerClassName={`${buttonClassName} border-transparent bg-emerald-500 text-slate-950 hover:bg-emerald-400`} />
      <ScheduleDemoModal source="contact_ids" triggerClassName={secondaryClassName} />
      <Link href="/troubleshoot-your-robot" className={secondaryClassName}>
        Troubleshoot Your Robot
      </Link>
      <Link href="/remote-assistance" className={secondaryClassName}>Remote Assistance</Link>
      <EquipmentReturnPolicyModal />
    </div>
  );
}
