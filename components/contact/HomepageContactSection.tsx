import ContactInformationModal from "@/components/contact/ContactInformationModal";
import ScheduleDemoModal from "@/components/demo-scheduling/ScheduleDemoModal";

export default function HomepageContactSection() {
  return (
    <section
      id="contact-us"
      aria-labelledby="homepage-contact-heading"
      className="px-6 pb-20 md:px-10 md:pb-24"
    >
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-8 text-white shadow-xl sm:p-10 md:p-12">
        <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-400">
          Contact Integrity Distribution Systems
        </p>
        <h2
          id="homepage-contact-heading"
          className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl"
        >
          Have Questions? We’re Here to Help.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          Need help choosing the right system? Have a complex property that may
          require multiple machines? Contact us today and let our team help you
          build the right solution.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <ContactInformationModal triggerClassName="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-500 px-7 py-4 text-center font-black text-slate-950 shadow-lg transition hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300" />
          <ScheduleDemoModal source="contact_ids" triggerClassName="inline-flex min-h-14 items-center justify-center rounded-2xl border border-emerald-300 px-7 py-4 text-center font-black text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300" />
        </div>
      </div>
    </section>
  );
}
