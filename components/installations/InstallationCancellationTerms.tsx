import { cancellationCopy, INSTALLATION_TERMS_VERSION } from "@/lib/installations/cancellation";

export default function InstallationCancellationTerms({ termsVersion = INSTALLATION_TERMS_VERSION }: { termsVersion?: string | null }) {
  return <section aria-label="Cancellation policy" className="mt-4 rounded-xl border p-4 text-sm leading-6">
    <h3 className="font-black">Cancellation before work begins</h3>
    <p className="mt-2">{cancellationCopy(termsVersion)}</p>
    <p className="mt-2">Contact IDS to request cancellation. IDS records the review and any refund due; recording a cancellation does not itself send a refund. Approved cash-on-arrival failure, rescheduling, and safety or work-termination rules remain separate.</p>
  </section>;
}
