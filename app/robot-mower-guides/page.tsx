import type { Metadata } from "next";
import AuthorityPage, { ArticleLink as A, AuthoritySection as Section } from "@/components/seo/AuthorityPage";
import { HOME_BREADCRUMB } from "@/components/seo/BreadcrumbJsonLd";
import { GUIDES_BREADCRUMB } from "@/components/seo/GuidePage";

export const metadata: Metadata = {
  title: "Robot Mower Guides & Buying Resources | IDS",
  description: "Research robot mower connectivity, navigation, terrain and ownership costs with IDS educational guides. Turn practical questions into a better equipment plan.",
  alternates: { canonical: "https://integrityautomowers.com/robot-mower-guides" },
  robots: { index: true, follow: true },
};

export default function GuidesHub() {
  return <AuthorityPage eyebrow="Learn before choosing equipment" title="Robot Mower Guides & Buying Resources"
    intro={<p>These educational resources explain the questions behind a robot mower decision: how the machine communicates, how it navigates, what traction means and how ownership changes the work. Use them to prepare a property assessment and a realistic operating plan before comparing the IDS lineup.</p>}
    breadcrumbs={[HOME_BREADCRUMB, GUIDES_BREADCRUMB]}
    cta={{ title: "Turn research into a property discussion", text: "Bring a lawn sketch, photos of difficult areas and a list of the tasks you want to change. Ask IDS about suitable equipment and available demonstration options for your property.", href: "/services-scheduling", label: "Discuss a demonstration or service option" }}>
    <Section title="Connectivity and navigation">
      <p><A href="/robot-mower-guides/do-robot-mowers-need-internet">Do Robot Mowers Need Internet or Wi-Fi?</A> separates setup, app access, remote monitoring and RTK correction links. Start here if coverage is weak or you need to understand which functions depend on an online connection.</p>
      <p><A href="/robot-mower-guides/rtk-gps-vslam-vision">RTK, GPS, VSLAM &amp; Vision: How Robot Mowers Navigate</A> explains satellite positioning, visual observations and sensor fusion. Use it to frame questions about tree cover, buildings and narrow routes without assuming one navigation label answers every property question.</p>
    </Section>
    <Section title="Ownership cost and the work that remains">
      <p><A href="/robot-mower-guides/robot-mower-vs-zero-turn">Robot Mower vs Zero-Turn Mower</A> compares operator time, maintenance, energy, charging, transport and replacement planning. It considers homeowners, acreage owners and commercial operators, with trimming and supervision still included in the job.</p>
      <p><A href="/robot-mower-guides/commercial-roi-labor-planning">Commercial Robot Mower ROI &amp; Labor Planning</A> provides a framework for organizations using their own costs and staffing records. It distinguishes operating differences, redeployed staff capacity and cash flow instead of supplying an assumed savings percentage.</p>
    </Section>
    <Section title="Terrain and drive systems">
      <p><A href="/robot-mower-guides/tracked-vs-wheeled">Tracked vs Wheeled Robot Mowers</A> explains traction, ground pressure, turning behavior and turf disturbance. Read it before treating tracks or wheels as a universal solution for slopes, wet ground or uneven surfaces.</p>
    </Section>
    <Section title="Use the guides with current product information">
      <p>The <A href="/robot-mowers">robot mower buying page</A> connects these decisions to equipment selection, and the <A href="/equipment">equipment catalog</A> provides current IDS configurations. Match the maintained grass, routes between zones and charging location to the actual platform. A broad technology description does not establish a model&apos;s capacity, service terms or permitted operating conditions.</p>
      <p>Review <A href="/professional-installation">professional installation and setup</A> for equipment placement, mapping and an operator walkthrough as applicable. Keep the remaining grounds tasks and responsibility for interruptions in the plan. Good research should produce clearer questions and a workable scope before equipment is ordered.</p>
    </Section>
  </AuthorityPage>;
}
