import { redirect } from "next/navigation";

export default function LegacyDemoSchedulingPage() {
  redirect("/services-scheduling?service=demo#request-demo");
}
