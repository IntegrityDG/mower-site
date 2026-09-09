import { redirect } from "next/navigation";
import ServiceShell from "@/components/service/ServiceShell";
import StaffPortal from "@/components/service/StaffPortal";
import { currentStaff } from "@/lib/service/auth";
import { serviceControls } from "@/lib/service/controls";
export const dynamic = "force-dynamic";
export const metadata = { title: "Service Staff | IDS", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page() { const actor = await currentStaff(); if (!actor) redirect("/staff/service/login"); const controls = serviceControls(); return <ServiceShell title="Service staff workspace"><StaffPortal actor={actor} controls={{ payments: controls.payments, cash: controls.cash, terminal: Boolean(controls.terminalReader) }} /></ServiceShell>; }
