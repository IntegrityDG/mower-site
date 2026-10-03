import type { Metadata } from "next";
import AuthorityPage, { ArticleLink as A, AuthoritySection as Section } from "@/components/seo/AuthorityPage";
import { HOME_BREADCRUMB } from "@/components/seo/BreadcrumbJsonLd";
import { SITE_CONTACT } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "Robot Mower Financing & Payment Options | IDS",
  description: "Explore robot mower financing through the existing IDS Hearth process. Review equipment choices, lender approval, final terms and separate payment options.",
  alternates: { canonical: "https://integrityautomowers.com/robot-mower-financing" },
  robots: { index: true, follow: true },
};

export default function RobotMowerFinancingPage() {
  return <AuthorityPage eyebrow="Equipment purchasing and financing"
    title="Robot Mower Financing & Payment Options"
    intro={<p>Robot mower financing starts with a clear equipment plan and a price for the configuration you intend to purchase. IDS can help coordinate equipment selection, the existing financing request process and the purchase arrangements from beginning to end. Financing is provided through participating third-party lenders; IDS does not make lending decisions or guarantee approval.</p>}
    breadcrumbs={[HOME_BREADCRUMB, { name: "Robot Mower Financing", path: "/robot-mower-financing" }]}
    cta={{ title: "Choose equipment and review the available purchase paths", text: "Use the existing IDS system builder to select equipment and review current payment options. If an item needs a quote or you are unsure how financing relates to the purchase, contact IDS before making a commitment.", href: "/#location-and-customer-path", label: "Build equipment and review payment options" }}>
    <Section title="Start with the equipment your property needs">
      <p>Compare the work area, terrain and mowing schedule before deciding how to pay. The <A href="/robot-mowers">robot mower buying guide</A> explains the differences between residential, large-property and commercial equipment. Financing does not change whether a machine is suitable for the lawn.</p>
      <p>Use the <A href="/equipment">equipment catalog</A> for current configurations, pricing where shown and availability. Specify the machine, selected package or modules and accessories you actually want. Items requiring final pricing confirmation should be resolved before you decide on a financing amount.</p>
      <p><A href="/equipment/lymow-one-plus">Lymow One Plus</A> follows a residential equipment decision. <A href="/equipment/yarbo">Yarbo</A> requires attention to the selected Core, package and compatible modules. <A href="/equipment/pandag-g1">Pandag G1</A> follows a commercial project review and quote process. Those purchase paths should remain clear while financing is discussed.</p>
    </Section>
    <Section title="Use the existing Hearth financing resource">
      <p>IDS already offers a Hearth financing resource through its website and supported purchase flow. You can <a href="https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee" target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-800 underline underline-offset-4">explore the existing IDS Hearth financing page in a new tab</a>. Review the information presented there and any subsequent lender disclosures.</p>
      <p>In the equipment builder, the Hearth selection is an equipment purchase request path. It does not itself approve a loan or complete a paid order. IDS receives the selected equipment and purchase preference so the next purchasing steps can be coordinated.</p>
      <p>For personal assistance with that financing resource, the existing IDS financing information directs buyers to <a href="tel:+15126075977" className="font-bold text-emerald-800 underline underline-offset-4">Hearth Concierge Service at (512) 607-5977</a>. Equipment configuration, pricing and fulfillment questions belong with IDS; lending questions and final loan terms belong with the applicable provider.</p>
    </Section>
    <Section title="Approval, rates and repayment terms come from the lender">
      <p>Financing is subject to third-party lender review and approval. Rates, repayment periods, fees and availability can vary. A financing request, discussion with IDS or equipment estimate does not establish that a buyer will be approved or receive any particular terms.</p>
      <p>When reviewing an actual offer, consider the annual percentage rate, repayment period, fees, payment schedule and total repayment amount. Read the final lender terms and ask the lender about anything unclear before accepting. A robot mower monthly payment should come from the actual offer, not a generic estimate on a buying guide.</p>
      <p>IDS is not a lender and does not determine financing terms. This page makes no approval, interest-rate, payment or funding-time promise. Equipment purchase arrangements and lender agreements are separate parts of the process.</p>
    </Section>
    <Section title="Confirm the eligible purchase amount and keep services separate">
      <p>Equipment and related eligible purchase items may be considered as part of an appropriate financing request, subject to confirmation of the itemized purchase and lender eligibility. Do not assume an accessory, module or other cost is included merely because it appears elsewhere on the website.</p>
      <p>The existing builder records professional installation and setup requests under separate terms. Those requests are not prepaid service charges in the configured equipment estimate. Review <A href="/professional-installation">professional installation and optional setup</A> for the published scope, booking, materials and travel arrangements.</p>
      <p>Installation, setup, travel, repair and support subscriptions require their own arrangements; do not assume they can be financed with equipment. The Remote Support subscription is handled separately from a Hearth equipment request. Keep those costs in your ownership budget and confirm the appropriate terms with IDS.</p>
    </Section>
    <Section title="Card, bank payment and financing are distinct choices">
      <p>The existing checkout presents supported payment methods according to current availability and the selected purchase. Card and ACH bank payment, where offered, are payment paths separate from the Hearth financing request. Review the final checkout total and the terms shown for the method you choose.</p>
      <p>Do not treat a submitted request as payment confirmation, and do not assume every method is available for every configuration. Quote-only equipment and items without final pricing can require an IDS review before a purchase is completed.</p>
      <p>If you want to ask about a separately arranged cash purchase or another payment arrangement, contact IDS first. Confirm availability and the agreed purchase terms rather than assuming cash appears among the online payment choices.</p>
    </Section>
    <Section title="Commercial buyers need a project and eligibility discussion">
      <p>For a commercial robotic mower, start with the <A href="/commercial-robot-mowers">commercial and municipal planning guide</A> and an equipment proposal suited to the site. Identify the purchasing organization, approval process and responsible operator before discussing payment arrangements.</p>
      <p>The presence of the existing Hearth link is not a promise that every business, municipal buyer or Pandag project is eligible for that financing path. Ask IDS about the proposed purchase and confirm any borrowing eligibility and permitted use directly with the lender. Equipment cost and projected operating savings do not guarantee financing approval or ROI.</p>
    </Section>
    <Section title="Get help before submitting a purchase request">
      <p>A <A href="/services-scheduling">robot mower demonstration</A> can help resolve operating questions before a configuration is finalized. Confirm machine availability and arrangements with IDS. A clear equipment decision makes the price and purchase discussion more useful.</p>
      <p><a href={SITE_CONTACT.email.href} className="font-bold text-emerald-800 underline underline-offset-4">Email IDS about your equipment purchase</a> with the intended machine, property requirements and any items needing clarification. IDS can help coordinate its part of the process while you review financing with the provider. Use the builder and contact resources for equipment; loan eligibility and terms are handled through the financing provider.</p>
    </Section>
  </AuthorityPage>;
}
