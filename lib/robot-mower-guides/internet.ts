import type { Guide } from "@/components/seo/GuidePage";

export const internetGuide: Guide = {
  slug: "do-robot-mowers-need-internet",
  title: "Do Robot Mowers Need Internet or Wi-Fi? | IDS",
  description: "Learn how robot mower internet, Wi-Fi, cellular and RTK connections differ. Plan setup, remote monitoring and outages around your selected IDS platform.",
  h1: "Do Robot Mowers Need Internet or Wi-Fi?",
  intent: "Understand connectivity requirements by function and platform",
  intro: "There is no single internet requirement for every robot mower. A machine may use one connection for setup, another for positioning corrections and another for remote app access. Before buying for a property with weak Wi-Fi, separate those functions. The useful question is which connections your selected model needs, where it needs them, and which tasks remain available when a connection fails.",
  sections: [
    { title: "Internet access is different from local communication", paragraphs: [
      "Wi-Fi connects equipment to a local wireless network. That network may provide internet access, but a strong Wi-Fi signal alone does not prove that the internet service is working. Bluetooth is normally a nearby device connection, while cellular service can provide a separate route online. Each has different coverage and setup considerations.",
      "Local navigation means the mower processes positioning and sensor information to follow its work area. Remote communication means information passes between the mower, an app or an online service. These functions can depend on different links, although some platforms also deliver positioning corrections over a network. Calling a mower autonomous does not establish that every function works offline.",
      "Use the [robot mower selection page](/robot-mowers) to identify a suitable platform, then check its current instructions. Avoid choosing solely from a Wi-Fi checkbox: it does not describe where coverage is needed, which hardware is included, or how the system handles interrupted communication.",
    ] },
    { title: "Setup, configuration and everyday app use", paragraphs: [
      "Initial setup can include creating an account, pairing the mower, connecting navigation equipment, downloading software and establishing the property map. Some steps require nearby access; others may require an online account or internet connection. Complete the supported process at the intended installation location rather than assuming a successful indoor pairing proves that the entire lawn is covered.",
      "After setup, changing a schedule, editing a boundary and checking status may have different requirements. An app that displays the last reported battery level is not necessarily communicating with the mower at that moment. Check connection indicators and timestamps before treating a displayed condition as current.",
      "Ask which controls work beside the mower and which work away from home. Confirm whether a phone needs mobile data, whether the mower needs its own online connection, and whether multiple authorized users can manage it. These details matter when a family member or grounds supervisor needs to respond while the main operator is elsewhere.",
    ] },
    { title: "RTK corrections have their own communication path", paragraphs: [
      "RTK positioning uses correction information alongside satellite observations. A local reference arrangement and a network correction service are different ways of supplying that information. The correction link is not automatically the same connection used for a phone app, and receiving satellite signals does not prove corrections are reaching the mower.",
      "For a local reference arrangement, ask how correction data travels to the mower and where the reference equipment needs power and signal access. For a network-based arrangement, establish which online connection supplies corrections and what happens when that connection is unavailable. Supported options vary with equipment and software; verify the selected configuration before planning around either approach.",
      "Tree cover, buildings and unsuitable reference placement can affect positioning even when internet service is healthy. Conversely, a communication problem can occur on an open lawn with good satellite visibility. The [wire-free mower assessment](/robot-mowers/wire-free) explains the property and mapping decisions that sit alongside these connection questions.",
    ] },
    { title: "What the IDS product information actually confirms", paragraphs: [
      "[Lymow One Plus](/equipment/lymow-one-plus) lists Bluetooth, Wi-Fi and 4G connectivity, with RTK plus VSLAM navigation and reference-station equipment. Those facts establish available connection types and the navigation combination. They do not, by themselves, establish unlimited cellular data, every offline feature, or an identical connection requirement across all operating tasks.",
      "[Yarbo](/equipment/yarbo) lists 4G, Wi-Fi, Bluetooth and Wi-Fi HaLow, alongside RTK, vision, IMU and odometry. HaLow is a supported communication option, not a promise that every obstruction or property layout will have adequate coverage. Confirm the selected Core, connection hardware, correction arrangement and current service terms rather than transferring instructions from another model.",
      "[Pandag G1](/equipment/pandag-g1) describes RTK positioning and 4G-connected app control together with LiDAR, vision and inertial data. For a commercial site, review the actual deployment and communications plan. Its sensor combination is not evidence that remote control, correction delivery and every mowing function remain available through every outage.",
    ] },
    { title: "Remote monitoring, updates and cellular service", paragraphs: [
      "Remote monitoring is most useful when someone can act on an alert. Decide who receives notifications, how they confirm the mower's location and condition, and who can visit the property. Internet access can support that workflow, but it does not replace local access when a machine needs inspection, cleaning or physical recovery.",
      "Firmware updates may require an online download and specific conditions for installation. Follow the manufacturer's instructions for power, connection quality and timing. Schedule an update when an operator can check the machine afterward, rather than assuming every update can happen unattended during an active mowing window.",
      "Where cellular is supported, verify local coverage and the service arrangement for that equipment. Hardware support for 4G does not establish data allowances, renewal charges or availability at the far edge of a property. Include any applicable service expense in ownership planning and check the conditions for remote assistance.",
    ] },
    { title: "Plan for an outage before it happens", paragraphs: [
      "Loss of internet can affect app status, notifications, updates or network-delivered corrections. Loss of a local correction link can be a separate problem. Depending on the model, configuration and fault, a machine may continue an allowed task, pause or require intervention. Do not promise uninterrupted mowing from a general description of autonomous navigation.",
      "During installation, review the documented response to each relevant interruption. Establish how an operator recognizes stale app information, safely checks the mower and restores service. Avoid disconnecting safety or navigation equipment as an improvised test; use a supported verification procedure with the responsible installer or manufacturer.",
      "Bring IDS a simple coverage sketch: charging location, reference equipment, home network, distant work zones and places where mobile service is weak. For an existing problem, [remote assistance](/remote-assistance) provides the established support path for supported equipment. Record the model, connection indicators and exact interruption so diagnosis can address the right link.",
    ] },
  ],
  cta: { title: "Match connectivity to the property", text: "Compare the intended mowing area and available connections with the selected platform's current setup requirements. IDS can help frame the equipment and installation questions before you commit.", href: "/robot-mowers", label: "Review the IDS robot mower lineup" },
};
