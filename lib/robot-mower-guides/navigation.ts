import type { Guide } from "@/components/seo/GuidePage";

export const navigationGuide: Guide = {
  slug: "rtk-gps-vslam-vision",
  title: "RTK vs GPS, VSLAM & Vision in Robot Mowers | IDS",
  description: "Understand GNSS, RTK, VSLAM, vision and sensor fusion in robot mowers. Compare their roles, property limitations and verified IDS navigation combinations.",
  h1: "RTK, GPS, VSLAM & Vision: How Robot Mowers Navigate",
  intent: "Explain navigation terminology and complementary sensor roles",
  intro: "Navigation terms describe parts of a robot mower's positioning system, not a guarantee about a particular lawn. Satellite positioning, visual observations and motion sensors can contribute different information. Understanding their roles makes it easier to ask useful questions about trees, buildings and routes between work zones. Equipment selection still depends on the complete platform and the property it will maintain.",
  sections: [
    { title: "GPS is one part of GNSS", paragraphs: [
      "GNSS means global navigation satellite system and describes satellite positioning systems as a group. GPS is one of those systems. A receiver estimates its position using satellite signals; the machine's control system then uses the available position information with its other inputs. A brochure mentioning GPS tells you less than a description of the entire navigation architecture.",
      "Open sky generally provides a better opportunity to receive satellite signals than an enclosed space. Trees and structures can obstruct signals, and buildings can reflect them. The resulting positioning conditions depend on the location and equipment. Good reception at the charging station does not demonstrate equally good reception in a narrow passage behind the house.",
      "When someone asks about RTK versus GPS, the terms are not necessarily opposing choices. RTK is an approach to improving satellite positioning with corrections. Ask how a particular mower obtains and uses those corrections, then evaluate the supporting sensors and the property's difficult areas.",
    ] },
    { title: "RTK adds corrections and installation requirements", paragraphs: [
      "RTK stands for real-time kinematic positioning. It combines satellite observations with correction information from a supported reference arrangement. A local reference station and a network-delivered correction service have different installation and connection requirements. Neither removes the need to assess where the mower itself receives usable positioning information.",
      "Reference placement, power and correction delivery belong in the setup plan. A reference station hidden beside a building is not equivalent to equipment installed in a suitable location. Where network corrections are supported, confirm service availability and the required online connection rather than assuming an ordinary home Wi-Fi signal supplies everything the mower needs.",
      "RTK capability should not be translated into a universal accuracy promise beside every wall or under every canopy. Ask how the selected system reports positioning quality, responds when corrections are unavailable and recovers after interruption. Our [internet and Wi-Fi guide](/robot-mower-guides/do-robot-mowers-need-internet) separates communication questions from local navigation.",
    ] },
    { title: "VSLAM uses visual observations to help locate the mower", paragraphs: [
      "VSLAM means visual simultaneous localization and mapping. Cameras observe visual features, and the system uses those observations to help estimate movement and position while building or using a map of the surroundings. It is a navigation process, not simply the presence of a camera on the machine.",
      "A visual system depends on usable observations. Lighting, obscured cameras and changes in the scene can affect the information available to it. A lawn that looks easy to a person is not proof that every visual navigation system will interpret it equally well. Test the selected platform in the conditions that matter for your mowing schedule.",
      "VSLAM can complement satellite positioning because visual observations provide a different kind of information. That does not justify a blanket claim that the machine can mow anywhere without satellite support. The manufacturer defines how the platform combines inputs and which operating conditions it supports.",
    ] },
    { title: "Vision, obstacle sensing and sensor fusion", paragraphs: [
      "Computer vision uses camera information to interpret the surroundings. Depending on the platform, it may contribute to navigation, object recognition or both. Obstacle sensing addresses what is in the machine's path; localization addresses where the machine is. Detecting a chair is not the same task as maintaining position inside a mapped boundary.",
      "LiDAR measures distance using light, while other sensors may report movement or orientation. An IMU, or inertial measurement unit, contributes motion and orientation information. Odometry estimates movement from the drive system. Each input has limitations, so modern platforms often combine multiple sources rather than relying on one label.",
      "Sensor fusion means using these inputs together to estimate the machine's state and guide operation. Complementary information can help when one source becomes less useful, but the combination remains model-specific. More sensor names do not automatically mean better results on your lawn or eliminate the need for clear work areas and suitable exclusions.",
    ] },
    { title: "Virtual boundaries define the job; no-go zones exclude areas", paragraphs: [
      "A virtual boundary is a stored work-area limit created through the platform's mapping process. It differs from an installed perimeter wire, but it still needs deliberate setup. A no-go zone marks an area that the machine should avoid. The navigation system must locate the mower within that map to apply those instructions.",
      "Boundary accuracy and obstacle recognition are separate considerations. Establish appropriate margins around water, roads, drop-offs and other hazards using the equipment's instructions and a site assessment. Do not rely on a camera to decide that every unsafe edge is recognizable or that every new object automatically creates a suitable exclusion.",
      "Routes between areas also need review. A narrow corridor must fit the machine and its supported navigation process, with suitable surface conditions and access. The [wire-free buying assessment](/robot-mowers/wire-free) connects these mapping concepts to equipment selection and practical installation decisions.",
    ] },
    { title: "The verified IDS navigation combinations", paragraphs: [
      "[Lymow One Plus](/equipment/lymow-one-plus) lists RTK plus VSLAM. That combination brings satellite positioning and visual navigation into its residential mowing platform. Review reference placement, charging access and the intended lawn rather than assuming that the VSLAM label makes every enclosed corner suitable.",
      "[Yarbo](/equipment/yarbo) lists RTK, vision, IMU and odometry. Its architecture combines positioning with observations of movement and surroundings. Check the current Core, mower module and supported setup for the configuration under consideration; another manufacturer's mapping instructions do not establish Yarbo's requirements.",
      "[Pandag G1](/equipment/pandag-g1) describes RTK, LiDAR, camera vision, inertial data and connected app control. These systems contribute to a commercial operating plan alongside charging and cutting choices. Evaluate its complete configuration for the project instead of treating a longer sensor list as a substitute for a site review.",
    ] },
    { title: "Assess the difficult places and revisit changes", paragraphs: [
      "Mark open turf, dense canopy, building edges and narrow passages on a property sketch. Include the return route to charging and any transitions where the machine changes direction or surface. Ask to verify those locations during setup: the easiest central lawn area rarely answers the most consequential navigation questions.",
      "Conditions can change after installation. A new fence, growing hedge, parked trailer or revised garden can alter visibility, access or the map's relevance. Review affected boundaries and transitions through the supported process, then confirm operation before restoring an unattended schedule.",
      "[Professional installation and setup](/professional-installation) can connect equipment placement, mapping, testing and operator instruction as applicable. Choose a platform because its documented approach fits the site and support plan. There is no universally superior navigation technology that makes every property assessment unnecessary.",
    ] },
  ],
  cta: { title: "Apply the technology to your lawn", text: "Use the wire-free assessment to compare navigation and mapping requirements with the areas you actually intend to mow, then review the relevant product configuration with IDS.", href: "/robot-mowers/wire-free", label: "Assess wire-free equipment fit" },
};
