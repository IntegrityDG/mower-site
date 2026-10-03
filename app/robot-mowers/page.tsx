import type { Metadata } from "next";
import AuthorityPage, { ArticleLink as A, AuthoritySection as Section } from "@/components/seo/AuthorityPage";
import { HOME_BREADCRUMB } from "@/components/seo/BreadcrumbJsonLd";

export const metadata: Metadata = {
  title: "Robot Mowers & Robotic Lawn Mowers | IDS",
  description: "Compare Lymow, Yarbo and Pandag robot mowers with IDS, a multi-brand specialist helping residential, large-property and commercial buyers plan the right system.",
  alternates: { canonical: "https://integrityautomowers.com/robot-mowers" },
  robots: { index: true, follow: true },
};

export default function RobotMowersPage() {
  return <AuthorityPage eyebrow="Robot mower buying guide"
    title="Robot Mowers for Residential, Large-Property & Commercial Lawn Care"
    intro={<p>A robot lawn mower brings mapped, scheduled mowing to a property, but choosing one starts with the ground it will maintain. Integrity Distribution Systems helps buyers compare Lymow, Yarbo and Pandag across residential lawns, larger properties and commercial operations, with equipment selection, setup and ongoing support considered together.</p>}
    breadcrumbs={[HOME_BREADCRUMB, { name: "Robot Mowers", path: "/robot-mowers" }]}
    cta={{ title: "Start with your property, then choose the mower", text: "Bring your mowable area, photos of difficult sections and a description of your current mowing routine. A demonstration is a useful next step when you want to understand operation before choosing a configuration.", href: "/services-scheduling", label: "Explore demos and Demo Parties" }}>
    <Section title="What a modern robotic lawn mower does">
      <p>A robotic mower follows an operating plan to cut designated turf on a schedule. Mapping, charging, obstacle handling and the owner’s routine all shape that plan. It can take over repeat mowing passes while people retain responsibility for inspection, maintenance, edge work and safe operation.</p>
      <p>Older boundary-wire-only systems define the work area using an installed perimeter wire. Modern wire-free robot mowers can instead use virtual boundaries recorded during mapping. Wire-free does not mean setup-free: the mower still needs a suitable charging location, reliable navigation and carefully defined exclusions around hazards.</p>
      <p>GPS provides satellite-based positioning. RTK adds a correction reference to improve positioning; vision uses cameras and visual features to help the machine understand its surroundings. Some systems combine these with additional sensors. Buildings, trees and changing obstacles make a site review more useful than selecting solely by navigation terminology. Our <A href="/robot-mowers/wire-free">wire-free navigation guide</A> explains the platform differences and why mapping still matters.</p>
    </Section>
    <Section title="Match the system to the work">
      <div className="grid gap-6 md:grid-cols-3">
        <div><h3 className="text-xl font-black text-slate-950">Residential lawns</h3><p className="mt-3">Check front-to-back access, gates, landscaping, children’s play areas and pets. A practical schedule works around the household and leaves room for charging, cleaning and manual trimming.</p></div>
        <div><h3 className="text-xl font-black text-slate-950">Large properties</h3><p className="mt-3">Measure maintained grass separately from the whole parcel. Long transitions, disconnected lawns, slopes and trees can matter as much as the acreage on a deed. A single machine must have enough working time to complete the actual mowing plan.</p></div>
        <div><h3 className="text-xl font-black text-slate-950">Commercial grounds</h3><p className="mt-3">Start with operating hours, public access and staff oversight. Parks, campuses and property managers need a deployment and support plan as well as equipment. Use our <A href="/commercial-robot-mowers">commercial and municipal mowing guide</A> to frame that review.</p></div>
      </div>
    </Section>
    <Section title="Three brands, different equipment decisions">
      <p><A href="/equipment/lymow-one-plus">Lymow One Plus</A> is a residential mowing option to evaluate for maintained lawns and larger home properties. Its published RTK and visual-navigation information helps frame questions about mapping and reference-station placement. Compare the actual property with the current model limits before choosing.</p>
      <p><A href="/equipment/yarbo">Yarbo</A> offers a modular approach for buyers considering mowing alongside other supported property tasks. The core, selected mower module and configuration should be evaluated as a complete system. Larger residential properties and suitable institutional sites need their own schedule and terrain review.</p>
      <p><A href="/equipment/pandag-g1">Pandag G1</A> is the commercial project platform in the IDS lineup. Cutting configuration, vegetation, navigation and charging choices belong in a site-specific proposal. A commercial-width machine is a different planning decision from a residential mower.</p>
      <p>A multi-brand robot mower specialist can compare those approaches against your priorities instead of making every property fit one platform. The <A href="/equipment">equipment catalog</A> remains the source for current configurations, published specifications, pricing and availability.</p>
    </Section>
    <Section title="Acreage, hills and complex terrain">
      <p>Advertised capacity is a starting point, not a promise that a particular lawn will be completed on your preferred schedule. Mowable acreage, grass growth, cutting frequency, runtime, charging interruptions and travel between zones all affect daily demand. Record which areas need frequent mowing and which can be maintained separately. The <A href="/robot-mowers/large-acreage">large-acreage planning guide</A> compares maintained turf, charging and single-machine or fleet decisions.</p>
      <p>For hills and rough ground, review the selected model’s published slope limits together with traction, side slopes, wet conditions and safe turning space. A bank beside water or a road needs a different exclusion plan from an open hill. Walk the property for roots, ruts, soft ground and narrow connections before drawing virtual boundaries. Review our <A href="/robot-mowers/hills-rough-terrain">hills and rough-terrain guide</A> for a closer look at those conditions.</p>
      <p>Vision and RTK do not eliminate the need to inspect the site. Tree canopy, buildings and reference-station placement can influence navigation. Plan safe pathways and no-go zones, and revisit the map when landscaping or property use changes.</p>
    </Section>
    <Section title="Installation, demonstrations and ownership support">
      <p><A href="/professional-installation">Professional installation and optional setup</A> can address equipment placement, work zones, transitions, operating schedules, testing and a customer walkthrough as applicable to the machine and property. Review the published labor, materials, travel and booking terms before requesting work.</p>
      <p>A <A href="/services-scheduling">demo or Demo Party</A> helps you discuss controls, configuration and real operating questions. Confirm the available machine, location and scheduling arrangements with IDS. A demonstration is part of evaluation, not a guarantee of identical results on every property.</p>
      <p>Plan for blade care, cleaning, inspection and assistance after purchase. <A href="/service">Service, repair and maintenance</A> depend on the supported equipment, diagnosis and current availability. Remote assistance and on-site work have separate terms.</p>
      <p>IDS presents financing options where offered through its existing purchase and financing resources. Lender approval, rates, fees and availability determine those terms; financing should be considered alongside the equipment and ownership costs. The <A href="/robot-mower-financing">financing and payment guide</A> explains the existing request path and separate purchase arrangements.</p>
    </Section>
    <Section title="Nationwide equipment sales, regional hands-on planning">
      <p>IDS is based in Southeast Missouri and sells equipment nationwide. It also works with buyers across the surrounding region on demonstrations, installation and support. Equipment delivery and regional hands-on appointments are separate arrangements; a sales destination does not establish on-site availability.</p>
      <p>Explore property considerations in <A href="/robot-mowers/missouri">Missouri</A>, <A href="/robot-mowers/southern-illinois">Southern Illinois</A>, <A href="/robot-mowers/northeast-arkansas">Northeast Arkansas</A>, <A href="/robot-mowers/western-kentucky">Western Kentucky</A> and <A href="/robot-mowers/western-tennessee">Western Tennessee</A>. Share your address and requested work so IDS can review scheduling, travel and the suitable support path before you commit.</p>
    </Section>
  </AuthorityPage>;
}
