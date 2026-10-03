import type { Guide } from "@/components/seo/GuidePage";

export const trackedGuide: Guide = {
  slug: "tracked-vs-wheeled",
  title: "Tracked vs Wheeled Robot Mowers | Terrain & Traction Guide | IDS",
  description: "Compare tracked and wheeled robot mowers by traction, turning, turf disturbance and maintenance. Assess uneven ground and verified Lymow and Yarbo examples.",
  h1: "Tracked vs Wheeled Robot Mowers",
  intent: "Explain drive-system tradeoffs for terrain and turf",
  intro: "Tracks and wheels are different ways to move a mower across a property. Neither design is the best choice for every lawn. Traction, machine weight, turning behavior, soil condition and the complete platform all matter. Use this comparison to identify the ground conditions that deserve attention, then assess the selected mower against its documented limits and your actual mowing routes.",
  sections: [
    { title: "Traction comes from the whole machine and surface", paragraphs: [
      "Traction is the ability to transfer drive force to the ground without excessive slipping. Tracks spread contact along a longer footprint, while wheels concentrate contact at their tires. Tread design, weight distribution and the surface influence both. A drive-system label alone cannot establish how a particular mower will behave on wet grass, loose soil or a slope.",
      "A tracked design can provide useful contact and grip in certain uneven conditions. A wheeled design can be appropriate for many flatter, open lawns with suitable surfaces and transitions. Compare the selected machines rather than assuming every tracked mower outperforms every wheeled mower on every part of a property.",
      "Look at where traction is needed: starting uphill, traveling across a slope, turning beside a bed or returning to charging. These are different maneuvers. A successful straight pass across dry turf does not establish reliable performance through a wet turn or a difficult transition later in the season.",
    ] },
    { title: "Ground pressure and turf disturbance are different questions", paragraphs: [
      "Ground pressure relates to the load distributed over the contact area. A larger contact footprint can spread load, but total machine weight and the actual contact geometry still matter. Do not infer a guaranteed soil-pressure advantage from tracks without considering the complete machine and its operating conditions.",
      "Turf disturbance also depends on how the mower turns. A tight turn can move tread or tire contact sideways against the surface. Repeated maneuvers in one place can mark turf even when straight-line travel looks gentle. Soil moisture, grass condition and the programmed route influence the result.",
      "Inspect charging approaches, narrow corners and heavily repeated turning areas. Where the platform supports route or schedule adjustments, use its instructions to manage those locations. If a patch remains vulnerable, revise the work area or use another maintenance method rather than assuming a different drive label alone will solve it.",
    ] },
    { title: "Wet soil is a site condition, not a traction challenge to ignore", paragraphs: [
      "Saturated ground can be damaged by equipment that has enough grip to keep moving. The ability to cross a soft area does not mean the area should be mowed. Watch drainage, low spots and places where runoff collects. An operating plan should recognize when soil conditions call for postponing work.",
      "Wet grass can also change traction and cutting conditions. Follow the selected platform's operating instructions and assess the actual slope and surface. Do not convert a manufacturer's dry-condition capability into a promise about rain, standing water or unstable soil.",
      "Treat seasonal changes as part of the property review. A route that works in a dry demonstration may become unsuitable after prolonged rain. Decide who checks conditions and changes the schedule or exclusions. Autonomous operation still needs someone responsible for the work area and its changing condition.",
    ] },
    { title: "Slopes, roots, ruts and transitions", paragraphs: [
      "Traveling uphill and traveling across a side slope place different demands on a mower. Stability, braking, center of gravity and permitted operating limits matter alongside traction. Evaluate the direction of travel and the consequences of slipping, especially near roads, water or abrupt changes in level. Tracks do not make every hillside acceptable.",
      "Roots and ruts can affect clearance, contact and the cutting deck. A drive system may cross an irregularity while the mower still struggles to cut it appropriately. Inspect the surface for exposed roots, holes and ridges before mapping a route, and distinguish uneven maintained turf from ground that needs repair or a different maintenance method.",
      "Transitions deserve their own inspection: grass to pavement, a charging approach, a gate threshold or a drainage edge. Consider clearance and the space needed to change direction. The [hills and rough-terrain assessment](/robot-mowers/hills-rough-terrain) connects these observations with platform selection, exclusions and installation planning.",
    ] },
    { title: "Efficiency and maintenance need model-specific comparisons", paragraphs: [
      "Drive-system efficiency depends on the mechanism, weight, surface and route. Tracks contain additional moving contact surfaces; wheels also vary in motor arrangement, tire design and steering method. Avoid promising a universal runtime advantage for either category without comparable model data and a representative operating plan.",
      "Maintenance should follow the manufacturer's procedures. Inspect the drive system for wear, trapped debris and damage as applicable. Ask how tracks, tires and associated components are serviced, what parts cost and who performs the work. A machine with good traction still needs a realistic cleaning and repair routine.",
      "Mowing productivity includes more than drive efficiency. Cutting configuration, route length, turning, charging and travel between zones influence the available schedule. On a large property, the [large-acreage guide](/robot-mowers/large-acreage) explains why layout and work windows must be assessed with the machine's actual coverage capability.",
    ] },
    { title: "Verified tracked examples in the IDS lineup", paragraphs: [
      "[Lymow One Plus](/equipment/lymow-one-plus) is a tracked residential mowing platform with RTK plus VSLAM navigation in the existing IDS product information. That makes it an appropriate tracked example, but its property fit still depends on surface conditions, transitions, charging and the current model's operating limits.",
      "[Yarbo](/equipment/yarbo) uses a tracked modular Core with compatible task modules. Evaluate the Core and selected mower configuration as a complete machine. Attachment choice, navigation requirements and access conditions remain part of the assessment; a shared tracked base does not mean every task configuration has identical mowing characteristics.",
      "Commercial equipment should be reviewed on its own verified specifications and project scope. [Pandag G1](/equipment/pandag-g1) belongs in a commercial cutting and operating-plan discussion, rather than being assigned an unsupported track-versus-wheel claim here. Keep comparisons tied to the exact model and configuration being quoted.",
    ] },
    { title: "Choose for the property, then verify the difficult areas", paragraphs: [
      "For a flatter open lawn, review a suitable wheeled machine without assuming tracks are necessary. For terrain with demanding transitions or uneven areas, consider how a tracked option might help and which constraints remain. The goal is a dependable mowing plan with acceptable turf condition, not the most aggressive-looking drive system.",
      "Bring photographs of slopes, drainage, roots, ruts and narrow turns to a [demonstration discussion](/services-scheduling). Ask to assess representative maneuvers and the planned charging route. Record the conditions during the demonstration so a result on dry, firm ground is not treated as proof of performance in every season.",
      "After installation, inspect the areas where the machine repeatedly turns or approaches charging. Review emerging wear and any changes in drainage or landscaping. Adjust operation through the supported process and retain another method for unsuitable areas. Property suitability is an ongoing relationship between the machine, route and ground conditions.",
    ] },
  ],
  cta: { title: "Assess traction in the context of the whole property", text: "Use the terrain assessment to identify slopes, hazards and transitions before selecting a drive system. IDS can review suitable equipment and available demonstration options.", href: "/robot-mowers/hills-rough-terrain", label: "Review hills and terrain fit" },
};
