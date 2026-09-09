import SetupTerms from "@/components/installations/SetupTerms";
import { SETUP_DESCRIPTION } from "@/lib/installations/setup";
import InstallationRefundNotice from "@/components/installations/InstallationRefundNotice";
import InstallationBookingForm from "@/components/installations/InstallationBookingForm";
import { readPublicServiceAvailability } from "@/lib/service/availability";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Professional Installation | Integrity Distribution Systems",
  description: "Request IDS professional autonomous mower installation.",
};

export default async function Page() {
  const availability = await readPublicServiceAvailability();
  const installation = availability.professional_installation;
  const setup = availability.professional_setup;
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-14 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="font-black uppercase tracking-[.2em] text-emerald-400">
            Integrity Distribution Systems
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-6xl">
            Professional Installation
          </h1>
          <p className="mt-5 max-w-3xl text-lg text-slate-200">
            Standard initial amount: $1,000 — $800 labor including up to four
            cumulative installation hours, plus a $200 materials allowance that
            is reconciled to actual use.
          </p>
          <div className="mt-6 rounded-2xl bg-white/10 p-5">
            <b>$250 booking deposit after IDS approval</b>
            <p className="mt-1 text-sm">
              The deposit is applied to the $1,000 initial amount. It is not an
              extra fee. The standard remaining initial balance is $750.
            </p>
          </div>
          <div className="mt-6 rounded-2xl border border-emerald-300/30 p-5">
            <h2 className="text-xl font-black">
              Optional Professional Setup &amp; Optimization — +$500
            </h2>
            <p className="mt-3">{SETUP_DESCRIPTION}</p>
            <p className="mt-3 text-sm">
              Installation + Setup starts at $1,500 with one $250 deposit and
              $1,250 remaining before approved travel or other charges. Each
              service has its own four included labor hours. Setup materials are
              separate; unused time does not roll over.
            </p>
          </div>
        </div>
      </section>
      {installation.available ? (
        <InstallationBookingForm
          setupAvailability={{
            available: setup.available,
            message: setup.public_message,
          }}
        />
      ) : (
        <section className="mx-auto max-w-4xl px-5 py-10">
          <div className="rounded-2xl bg-white p-7">
            <h2 className="text-2xl font-black">CURRENTLY UNAVAILABLE</h2>
            <p className="mt-3">
              {installation.public_message ||
                "New Professional Installation requests are currently unavailable. Existing customers can continue using their private links."}
            </p>
            <div className="mt-5">
              <SetupTerms />
            </div>
            <InstallationRefundNotice />
          </div>
        </section>
      )}
    </main>
  );
}
