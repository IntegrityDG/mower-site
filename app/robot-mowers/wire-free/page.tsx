import type { Metadata } from "next";
import AuthorityPage, { ArticleLink as A, AuthoritySection as Section } from "@/components/seo/AuthorityPage";
import { HOME_BREADCRUMB } from "@/components/seo/BreadcrumbJsonLd";

export const metadata: Metadata = {
  title: "Robot Mowers Without Boundary Wire | RTK & Virtual Boundaries | IDS",
  description: "Understand robot mowers without boundary wire: RTK, GPS, vision and virtual boundaries. Compare IDS platforms and plan mapping, no-go zones and professional setup.",
  alternates: { canonical: "https://integrityautomowers.com/robot-mowers/wire-free" },
  robots: { index: true, follow: true },
};

export default function WireFreePage() {
  return <AuthorityPage eyebrow="Navigation and virtual boundaries"
    title="Robot Mowers Without Boundary Wire"
    intro={<p>A robot mower without boundary wire uses a mapped work area rather than a physical perimeter wire to define where it should operate. That can change how a lawn is set up and adjusted, but it still requires a deliberate plan. IDS helps buyers compare the different navigation approaches in Lymow, Yarbo and Pandag and assess them against the actual property.</p>}
    breadcrumbs={[HOME_BREADCRUMB, { name: "Robot Mowers", path: "/robot-mowers" }, { name: "Wire-Free Robot Mowers", path: "/robot-mowers/wire-free" }]}
    cta={{ title: "See mapping and navigation as part of the purchase decision", text: "Bring a lawn map and photos of tree cover, buildings, narrow passages and potential charging locations. Ask IDS about available demonstrations and how a suitable platform would be set up for your work areas.", href: "/services-scheduling", label: "Discuss a wire-free mower demonstration" }}>
    <Section title="Perimeter wire and virtual boundaries">
      <p>A traditional perimeter-wire system detects an installed wire that outlines the lawn and relevant exclusions. The wire is part of the boundary arrangement, so changing a work area may require physical changes to that installation.</p>
      <p>A wire-free robot mower instead uses mapped boundaries stored by its control system. Those virtual boundaries identify the intended lawn, with no-go zones for areas that should remain outside operation. Creating or changing them is still a setup task governed by the chosen platform’s instructions.</p>
      <p>Wire-free describes the perimeter approach, not the absence of all wiring or equipment. Charging needs power, and positioning hardware may require its own placement and connections. A robot mower with no perimeter wire can still need professional planning for a difficult property.</p>
    </Section>
    <Section title="GPS, GNSS and RTK in plain language">
      <p>GNSS is the broader term for satellite-navigation systems; GPS is one of those systems. A receiver uses satellite signals to estimate position. The useful buying question is how the complete mower maintains the position information it needs on your lawn, not simply whether its brochure mentions GPS.</p>
      <p>RTK adds correction information to satellite positioning through the platform’s supported reference arrangement. That is why an RTK robot mower involves more than installing a GPS-equipped machine and pressing start. Reference placement, signal conditions and the mower’s other navigation systems matter.</p>
      <p>When comparing RTK versus GPS robot mowers, look at the full navigation architecture and setup requirements. Do not assume every system uses the same reference equipment, correction method or response when signals are obstructed. Follow the model-specific installation and operating instructions.</p>
    </Section>
    <Section title="Vision, VSLAM and obstacle sensing do different jobs">
      <p>Vision navigation uses cameras and visual information to help a system understand its surroundings. VSLAM means visual simultaneous localization and mapping: visual observations help estimate where the machine is while building or using a representation of the environment.</p>
      <p>Other sensors can contribute motion or orientation information. Obstacle sensing helps identify objects or conditions along a route. These functions can work together, but recognizing an object and knowing the mower’s position within a mapped area are different tasks.</p>
      <p>Neither navigation nor obstacle detection should be the only safety measure beside a road, pond or drop-off. Establish suitable exclusions, keep the work area clear and maintain appropriate oversight. A camera does not turn every visible surface into an approved mowing area.</p>
    </Section>
    <Section title="The IDS platforms use distinct navigation combinations">
      <p><A href="/equipment/lymow-one-plus">Lymow One Plus</A> lists RTK plus VSLAM in its existing product information. Its virtual-boundary approach combines satellite positioning and visual navigation. A suitable reference-station location remains part of the setup discussion for the residential lawn.</p>
      <p><A href="/equipment/yarbo">Yarbo</A> combines RTK positioning, vision, an inertial measurement unit and odometry in its published architecture. In plain terms, those additional inputs help describe motion and orientation. Review the selected Core and mower configuration and its current mapping requirements rather than assuming it uses Lymow’s exact approach.</p>
      <p><A href="/equipment/pandag-g1">Pandag G1</A> combines RTK, LiDAR, camera vision, inertial data and connected app control in a commercial platform. Its navigation supports a project-specific operating plan alongside cutting and charging choices. That commercial architecture should be evaluated against the site, not treated as identical to either residential approach.</p>
      <p>The <A href="/robot-mowers">robot mower buying guide</A> explains where the platforms fit in the broader lineup. Current product pages remain the reference for manufacturer-stated capabilities, hardware and configuration details.</p>
    </Section>
    <Section title="Map the lawn, exclusions and routes between zones">
      <p>Start with the intended work area and charging location. Create boundaries and no-go zones using the platform’s supported process. Review gardens, water, traffic, walls and changes in level before deciding where the machine should travel.</p>
      <p>Multi-zone operation needs a plan for getting between work areas. Gates, paths and narrow corridors may require a suitable mapped transition or manual relocation. Map only routes that have been reviewed as appropriate for the machine and property.</p>
      <p>Test the operating plan, including the return to charging, rather than judging setup from a map alone. The person responsible for the mower should understand how to adjust a schedule, recognize an interruption and request help.</p>
    </Section>
    <Section title="Trees, buildings and property changes">
      <p>Tree canopy and structures can affect signal visibility and the navigation assessment. Photograph enclosed lawns and covered passages so those conditions are part of equipment selection. Do not interpret combined navigation as a guarantee that any mower will work under every tree or beside every building.</p>
      <p>Review the map when landscaping, fences or property use changes. A new garden, parked object or altered route may require revised exclusions. A virtual boundary can be adjusted through the appropriate process, but that does not remove the need to inspect and test the changed area.</p>
      <p><A href="/professional-installation">Professional installation and optional setup</A> can cover placement, mapping, transitions, schedules, testing and a customer walkthrough as applicable. Wire-free does not mean zero setup. For an operating issue, use the existing <A href="/troubleshoot-your-robot">troubleshooting resources</A> and supported-equipment assistance path rather than guessing at a new route around a hazard.</p>
    </Section>
  </AuthorityPage>;
}
