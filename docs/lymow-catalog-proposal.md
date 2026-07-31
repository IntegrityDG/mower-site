# Lymow One Plus Catalog Proposal

Status: **review only**. The companion SQL has not been executed, no manufacturer-sync candidate has been approved, and no image has been downloaded or published.

## Review scope

This revision incorporates the final safety audit for the 24 Lymow review candidates: 15 text/specification candidates and 9 image candidates. It also removes the existing internal verification sentence from the active Straight Blade 2.0 option so no developer or review instruction remains in customer-facing Lymow copy.

Official sources:

- [Lymow One Plus product page](https://www.lymow.com/products/lymow-one-plus-robotic-lawn-mower)
- [Lymow warranty policy](https://www.lymow.com/pages/warranty-policy)
- [Lymow accessories collection](https://www.lymow.com/collections/accessories)
- [Lymow One Plus Battery](https://www.lymow.com/products/528wh-lifepo4-battery-for-lymow-one-plus)
- [Lymow Track](https://www.lymow.com/products/replacement-track-for-lymow-one-plus)
- [RTK Reference Station](https://www.lymow.com/products/rtk-set)
- [RTK Power Adapter](https://www.lymow.com/products/rtk-power-supply)
- [RTK Station Extension Cable](https://www.lymow.com/products/rtk-station-extension-cable)
- [Battery Direct Charging Cable](https://www.lymow.com/products/battery-direct-charging-cable-for-lymow-one-plus-528wh-battery)
- [5A Charging Station Adapter](https://www.lymow.com/products/5a-adapter-with-extension-cable-for-lymow-one-plus-charging-station)
- [10A Charging Station Adapter](https://www.lymow.com/products/10a-adapter-with-extension-cable-for-lymow-one-plus-charging-station)

Lymow marks specific specification-table values with an asterisk as laboratory measurements; actual performance can vary with use and environment. The 45° slope value is not starred. The 1.73-acre daily figure is associated with the 10A charging configuration and is not presented as a laboratory-footnote value or a whole-property size rating.

## Candidate disposition

| Disposition | Count | Treatment |
| --- | ---: | --- |
| Accepted | 8 | Normalized verified facts are included. |
| Rejected | 6 | Metadata, script, testimonial, and incorrect configuration excerpts remain excluded. |
| Manual verification | 10 | One battery-label/capacity candidate and all nine image candidates remain unapproved. |
| **Total** | **24** | Every Lymow candidate remains accounted for. |

The replacement battery is displayed by its verified official name, `Lymow One Plus Battery`; `Battery 2.0` and accessory-capacity wording are not published. No proposed statement approves image use.

## Proposed customer-facing catalog content

The text in this section is the exact content proposed by `supabase/seeds/lymow-catalog-proposal.sql`.

### Product fields

#### Homepage summary

Lymow One Plus combines a 16-inch dual-rotary cutting system, tracked drive, RTK + VSLAM virtual-boundary navigation, and sensor-assisted obstacle avoidance.

#### Full description

Lymow One Plus is a virtual-boundary robotic mower for segmented, sloped, uneven, or multi-zone residential lawns. Its tracked drive and 16-inch dual-rotary cutting system support a 1.2–4.0-inch cutting-height range, while RTK + VSLAM navigation, app management for up to 80 zones, AI vision, ultrasonic sensing, automatic recharge, and resume capability support automated mowing across mapped zones. The mower is offered in 5A and 10A configurations with different charge times and manufacturer-stated estimated daily mowing coverage.

#### Capability

Tracked, virtual-boundary robotic mowing

#### Best fit

Manufacturer-stated estimated daily mowing coverage: up to 1.1 acres per day with the 5A configuration or up to 1.73 acres per day with the 10A configuration. These figures are daily operating estimates, not whole-property size ratings.

#### IDS guidance

Choose between the 5A and 10A mower configurations using estimated daily mowing demand, terrain, zone count, charging cadence, and RTK placement. The 15-acre figure is map-storage capacity, not mowing capacity or a whole-property acreage recommendation.

### Hero

#### Heading

Lymow One Plus: Tracked Power for Complex Lawns

#### Supporting text

A tracked robotic mower with RTK + VSLAM virtual-boundary navigation, a 16-inch dual-rotary cutting system, and 5A or 10A mower configurations for different daily mowing demands.

### Product overview

Lymow One Plus uses tracked drive and RTK + VSLAM virtual-boundary navigation to automate mowing across segmented, sloped, uneven, or multi-zone lawns. Its 16-inch dual-rotary cutting system supports cutting heights from 1.2 to 4.0 inches, while AI vision, ultrasonic sensing, automatic recharge, and resume capability support operation across mapped zones.

The mower is offered in 5A and 10A configurations. Each mower package includes the mower, charging station, one charging-station adapter, charging extension cable, RTK hardware, mounting hardware, and printed guides. Separately sold batteries, tracks, charging adapters, cables, and RTK components are replacement or optional accessories rather than required additions to configure the mower.

### Key strengths

- Tracked drive with manufacturer-rated slope handling up to 45° (100% incline) and obstacle crossing up to 2.8 in.
- 16-inch dual-rotary cutting system with a 1.2–4.0-inch cutting-height range.
- RTK + VSLAM navigation with virtual boundaries instead of a perimeter wire.
- App management for up to 80 zones.
- AI vision, 5 ultrasonic sensors, 2 Hall sensors, and automatic recharge/resume.
- LiFePO₄ battery with up to 3 hours of runtime and a manufacturer-stated 2,000-charge-cycle rating.
- IPX6 water-resistance rating.

### Property considerations and limitations

- Manufacturer-stated estimated daily mowing coverage is up to 1.1 acres per day with the 5A configuration and up to 1.73 acres per day with the 10A configuration. These are daily operating estimates, not maximum lawn-size or whole-property acreage ratings.
- Maximum slope and coverage are manufacturer-rated figures, and actual results vary with terrain, grass density, weather, routing, and operating conditions.
- Reliable RTK-guided operation requires a suitable RTK reference-station location. Without a usable RTK connection, Lymow states that operation is limited to approximately 0.025–0.037 acres and up to 10 minutes of mowing time.
- The minimum cutting height is 1.2 in.
- The mower weighs 78.5 lb ±1 lb; access, transport, recovery, and service planning should account for that weight.
- Map storage of 15 acres is not a daily mowing-capacity or property-size rating.
- Lymow One and Lymow One Plus batteries and blades are not interchangeable.

### Specifications

| Specification | Proposed value |
| --- | --- |
| Navigation | RTK + VSLAM |
| RTK coverage radius | Up to 3,200 ft |
| Map storage | 15 acres |
| Multi-zone management | Up to 80 zones |
| Connectivity | Bluetooth, Wi-Fi, and 4G |
| Cliff detection | 2 Hall sensors |
| Obstacle avoidance | AI vision, 5 ultrasonic sensors, and 2 Hall sensors |
| Slope handling | Up to 45° (100% incline) |
| Obstacle crossing | Up to 2.8 in* |
| Blade system | Rotary mulching blades; dual-rotary cutting system |
| Mowing speed | 1.0–3.3 ft/s |
| Cutting height | 1.2–4.0 in |
| Cutting width | 16 in |
| Blade speed | 3,000–6,000 RPM* |
| Rated / peak power | 680 W / 1,785 W |
| Maximum mowing coverage per hour | 0.23 acres |
| Maximum mowing coverage per charge | 0.57 acres |
| Battery | LiFePO₄; 15,000 mAh (15 Ah); 35.2 V |
| Maximum runtime | Up to 3 hours |
| Battery-life rating | 2,000 charge cycles* |
| Water resistance | IPX6 |
| Product weight | 78.5 lb ±1 lb |
| Product dimensions | 29.5 × 23.6 × 12.6 in (L × W × H) |

\*Lymow identifies the starred specification-table values as laboratory measurements; actual performance can vary with use and environment.

### 5A and 10A mower configurations

#### 5A mower configuration

- Charging voltage: 39 V
- Charge time: 150 minutes from 10% to 90%
- Manufacturer-stated estimated daily mowing coverage: up to 1.1 acres per day

#### 10A mower configuration

- Charging voltage: 40.5 V
- Charge time: 90 minutes from 10% to 90%
- Manufacturer-stated estimated daily mowing coverage: up to 1.73 acres per day

Select either the 5A or 10A mower configuration. The corresponding charging configuration is associated with the selected mower; no additional charger-selection step is required.

### Included equipment

- Lymow One Plus ×1
- Charging station ×1
- Charging-station adapter ×1
- Charging-station extension cable, 10 m ×1
- Charging-station ground stakes ×4
- RTK reference station ×1
- Radio antenna ×1
- Mounting poles ×2
- Wall-mount bracket ×1
- RTK ground stake ×1
- Expansion bolts ×4
- RTK power adapter ×1
- RTK station extension cables, 5 m ×2
- User manual ×1
- Quick-start guide ×1

The separately sold charging adapters, charging cables, and RTK components are replacement or optional accessories. The charging and RTK equipment listed above is included with the mower package.

### Replacement and optional accessories

- **Lymow One Plus Battery:** separately sold replacement battery designed for Lymow One Plus; not compatible with Lymow One.
- **Battery Direct Charging Cable:** separately sold optional direct-charging cable designed for the Lymow One Plus battery; not compatible with the Lymow One battery.
- **Replacement Lymow Track:** separately sold replacement track compatible with Lymow One and Lymow One Plus.
- **RTK Reference Station:** separately sold replacement or additional set containing one RTK reference station and one antenna; compatible with Lymow One and Lymow One Plus.
- **RTK Power Adapter:** separately sold replacement or additional RTK power adapter compatible with Lymow One and Lymow One Plus.
- **RTK Station Extension Cable:** separately sold replacement or additional extension cable compatible with Lymow One and Lymow One Plus.
- **5A Charging Station Adapter:** separately sold replacement or additional adapter compatible with Lymow One and Lymow One Plus; includes a 10 m extension cable.
- **10A Charging Station Adapter:** separately sold replacement or additional adapter compatible with Lymow One and Lymow One Plus; includes a 10 m extension cable.

### Warranty

Lymow provides a 3-year limited warranty for the Lymow One Plus. Tracks, blades, normal wear, misuse, unauthorized repairs, modifications, and commercial use are excluded. Warranty service is tied to the mower’s serial number, original purchaser, and original purchase region. Full manufacturer warranty terms apply.

### Final system-builder CTA

#### Heading

Ready to Build Your System?

#### Body

Choose your Lymow One Plus configuration, compatible accessories, delivery options, and eligible IDS support services in the guided system builder.

#### Primary CTA

Build Your System

## Variant descriptions

| Variant slug | Proposed public name | Proposed description |
| --- | --- | --- |
| `lymow-one-plus-5a` | Lymow One Plus — 5A Configuration | Lymow One Plus 5A mower configuration. Manufacturer-stated charge time: 150 minutes from 10% to 90%. Manufacturer-stated estimated daily mowing coverage: up to 1.1 acres per day. |
| `lymow-one-plus-10a` | Lymow One Plus — 10A Configuration | Lymow One Plus 10A mower configuration. Manufacturer-stated charge time: 90 minutes from 10% to 90%. Manufacturer-stated estimated daily mowing coverage: up to 1.73 acres per day. |

## Option changes

| Option slug | Proposed customer-facing treatment | Public status |
| --- | --- | --- |
| `lymow-5a-charger` | Active internal definition represented by the 5A mower variant and excluded from customer-facing option collections. | Preserve `active` |
| `lymow-10a-charger` | Active internal definition represented by the 10A mower variant and excluded from customer-facing option collections. | Preserve `active` |
| `lymow-battery-528wh` | Rename to `Lymow One Plus Battery`; remove unverified public capacity/2.0 wording. | Preserve `active` |
| `lymow-straight-blade-2` | Keep name; remove the existing internal “Confirm…” sentence from its description. | Preserve `active` |
| `lymow-tracks-pair` | Rename to `Replacement Lymow Track`; use quantity-neutral compatibility copy so the existing name-based catalog classifier places it in Replacement Parts. | Preserve `active` |
| Six RTK/charging/cable rows | Finished replacement/additional accessory descriptions with no internal source notes. | Preserve `active` |

The stable option slug `lymow-tracks-pair` is retained. Its public name does not claim a pack quantity, and the row remains customer-visible.

## Charging behavior and relationships

The customer chooses exactly one mower variant: 5A or 10A. The existing Lymow charger option group is not recreated or modified, and the application already treats it as built into the mower variant.

The SQL adds only these relationships:

| Variant | Option | Relationship | Quantity |
| --- | --- | --- | ---: |
| `lymow-one-plus-5a` | `lymow-5a-charger` | `defines_variant` | 1 |
| `lymow-one-plus-10a` | `lymow-10a-charger` | `defines_variant` | 1 |

The two configuration-mirror options are hidden, so they cannot appear as another charger question or billable add-on. Separately sold 5A/10A charging-station adapters and cables remain active replacement or optional accessories.

## Internal manual-verification notes

These notes are intentionally excluded from every customer-facing SQL value:

- Dealer image-use permission remains unconfirmed for all nine image candidates; no media change is proposed.
- The shared box list names one generic charging-station adapter but does not identify its amperage by mower configuration.
- `Battery 2.0` and accessory-capacity wording remain unsupported by visible official accessory copy.
- The official track page does not establish the old catalog row's two-piece quantity; the proposed public name is quantity-neutral.
- The standalone RTK extension-cable page does not state length or quantity; no such value is proposed for the optional accessory.
- No whole-property acreage recommendation is supported; only manufacturer-stated estimated daily mowing coverage is presented.
- The existing `Straight Blade 2.0` name is preserved, but its internal quantity-verification instruction is removed from the public description.

## SQL safety and scope

The complete companion seed:

- uses a transaction-level advisory lock for this proposal;
- locks the stable Lymow target rows;
- briefly locks `catalog_product_page_sections` against concurrent DML because the current schema has no unique section identity;
- briefly locks `catalog_variant_options` between relationship validation and upsert;
- identifies sections only by the Lymow page, `section_type='content'`, and exact known legacy/final heading;
- preserves unexpected sections and appends missing reviewed sections after the current highest sort order;
- emits a PostgreSQL notice when desired positions contain unexpected content;
- applies `IS DISTINCT FROM` to every ordinary update;
- changes `updated_at` only with a real semantic change;
- uses a conditional `ON CONFLICT` update for the two variant relationships.

No SQL statement touches pricing, services, service areas, delivery eligibility, payment, financing, packages, media, private tables, manufacturer monitoring, RLS, grants, permissions, other brands, or excluded-brand records/wording.

## Expected mutations against the audited current state

| Table | First-run updates | First-run inserts | Second-run updates | Second-run inserts |
| --- | ---: | ---: | ---: | ---: |
| `public.catalog_products` | 1 | 0 | 0 | 0 |
| `public.catalog_product_pages` | 1 | 0 | 0 | 0 |
| `public.catalog_product_page_sections` | 3 | 5 | 0 | 0 |
| `public.catalog_product_variants` | 2 | 0 | 0 | 0 |
| `public.catalog_options` | 11 | 0 | 0 | 0 |
| `public.catalog_variant_options` | 0 | 2 | 0 | 0 |
| **Total** | **18** | **7** | **0** | **0** |

The extra option update relative to the earlier audit is the deliberate removal of the active Straight Blade 2.0 row's internal verification instruction.
