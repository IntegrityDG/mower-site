import { DEFAULT_PRICING, type PricingSnapshot } from "@/lib/installations/policy";
import { SETUP } from "@/lib/installations/setup";

const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(cents / 100);

export default function InstallationLaborTerms({ pricing = DEFAULT_PRICING }: { pricing?: PricingSnapshot }) {
  const includedHours = pricing.includedLaborMinutes === 240 ? "four" : pricing.includedLaborMinutes / 60;
  const sameAsSetup = pricing.additionalLaborHourlyCents === SETUP.hourlyCents && pricing.laborIncrementMinutes === SETUP.incrementMinutes;

  return <div aria-label="Installation labor terms" className="space-y-2 text-sm leading-6">
    <p><strong>Additional Installation labor after the {includedHours} cumulative included labor hours is {money(pricing.additionalLaborHourlyCents)}/hour, billed at {money(pricing.additionalLaborHourlyCents * pricing.laborIncrementMinutes / 60)} per started {pricing.laborIncrementMinutes} minutes.</strong>{sameAsSetup && " This is the same overtime rate as optional Professional Setup & Optimization."}</p>
    <p>Most installations are expected to finish within the four included labor hours, but unexpected site conditions can sometimes make a job take longer.</p>
    <p>Installation and optional Setup have separate four-hour labor allowances. Setup time does not extend the installation allowance.</p>
  </div>;
}
