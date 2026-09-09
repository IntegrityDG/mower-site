import { redirect } from "next/navigation";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
export const dynamic = "force-dynamic";
export default async function Page() { if (!await isReviewAdmin()) redirect("/admin/reviews"); redirect("/staff/service"); }
