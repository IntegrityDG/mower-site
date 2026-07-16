-- REVIEWED PROPOSAL. DO NOT EXECUTE UNTIL IDS APPROVES THE CONTENT.
--
-- Scope:
--   * Public Lymow One Plus catalog content only.
--   * Stable product, variant, option, and section-heading lookups.
--   * Semantic no-op guards: a second execution performs no writes.
--   * Transaction and table locking prevent overlapping section inserts.
--   * No pricing, promotion, service-area, service, delivery, payment,
--     financing, package, media, RLS, grant, permission, private catalog,
--     source-monitoring, candidate-status, or other-brand changes.

begin;

set local lock_timeout = '10s';

-- Serialize executions of this exact proposal. The lock is released
-- automatically on commit or rollback.
select pg_advisory_xact_lock(
  hashtext('ids.catalog-proposal'),
  hashtext('lymow-one-plus')
);

-- Validate and lock every stable catalog target before any DML.
do $validate$
declare
  matched integer;
begin
  perform product.id
  from public.catalog_products product
  where product.slug = 'lymow-one-plus'
    and product.brand = 'Lymow'
  for update of product;

  get diagnostics matched = row_count;
  if matched <> 1 then
    raise exception 'Expected exactly one Lymow product with slug lymow-one-plus; found %.', matched;
  end if;

  perform page.id
  from public.catalog_product_pages page
  join public.catalog_products product on product.id = page.product_id
  where product.slug = 'lymow-one-plus'
    and product.brand = 'Lymow'
  for update of page;

  get diagnostics matched = row_count;
  if matched <> 1 then
    raise exception 'Expected exactly one product page for lymow-one-plus; found %.', matched;
  end if;

  perform variant.id
  from public.catalog_product_variants variant
  join public.catalog_products product on product.id = variant.product_id
  where product.slug = 'lymow-one-plus'
    and product.brand = 'Lymow'
    and variant.variant_slug in ('lymow-one-plus-5a', 'lymow-one-plus-10a')
  order by variant.variant_slug
  for update of variant;

  get diagnostics matched = row_count;
  if matched <> 2 then
    raise exception 'Expected both Lymow One Plus 5A and 10A variants; found %.', matched;
  end if;

  perform option.id
  from public.catalog_options option
  join public.catalog_products product on product.id = option.product_id
  where product.slug = 'lymow-one-plus'
    and product.brand = 'Lymow'
    and option.option_slug in (
      'lymow-5a-charger',
      'lymow-10a-charger',
      'lymow-battery-528wh',
      'lymow-straight-blade-2',
      'lymow-tracks-pair',
      'lymow-rtk-reference-station',
      'lymow-battery-direct-charging-cable',
      'lymow-rtk-extension-cable',
      'lymow-rtk-power-adapter',
      'lymow-10a-charging-station-adapter',
      'lymow-5a-charging-station-adapter'
    )
  order by option.option_slug
  for update of option;

  get diagnostics matched = row_count;
  if matched <> 11 then
    raise exception 'Expected eleven reviewed Lymow configuration/accessory option rows; found %.', matched;
  end if;
end
$validate$;

-- No unique section identity exists in the current schema. This short lock
-- blocks arbitrary concurrent section DML while identities are checked and
-- missing sections are inserted. Reads remain available.
lock table public.catalog_product_page_sections
in share row exclusive mode;

-- Positively identify intended sections by page, content type, and a known
-- legacy or final heading. Unexpected occupants are preserved. Missing Lymow
-- sections are appended after the current highest sort order, and a notice
-- reports desired-position collisions for manual layout review.
do $section_review$
declare
  collision_summary text;
begin
  if exists (
    with proposed_sections(
      logical_order,
      legacy_heading,
      prior_heading,
      final_heading
    ) as (
      values
        (1, 'Residential Autonomous Mowing', null::text, 'Product overview'),
        (2, 'Choose the Right Configuration', null::text, 'Key strengths'),
        (3, 'IDS Setup and Support', null::text, 'Property considerations and limitations'),
        (4, null::text, 'Verified specifications', 'Specifications'),
        (5, null::text, '5A versus 10A configurations', '5A and 10A mower configurations'),
        (6, null::text, null::text, 'Included equipment'),
        (7, null::text, 'Compatible accessories', 'Replacement and optional accessories'),
        (8, null::text, 'Warranty summary', 'Warranty')
    )
    select proposed.logical_order
    from proposed_sections proposed
    join public.catalog_product_page_sections section
      on section.section_type = 'content'
     and section.heading in (
       proposed.final_heading,
       proposed.legacy_heading,
       proposed.prior_heading
     )
    join public.catalog_product_pages page on page.id = section.product_page_id
    join public.catalog_products product on product.id = page.product_id
    where product.slug = 'lymow-one-plus'
      and product.brand = 'Lymow'
    group by proposed.logical_order
    having count(*) > 1
  ) then
    raise exception 'Multiple Lymow page sections match the same intended section identity. Manual review is required.';
  end if;

  with proposed_sections(
    logical_order,
    legacy_heading,
    prior_heading,
    final_heading
  ) as (
    values
      (1, 'Residential Autonomous Mowing', null::text, 'Product overview'),
      (2, 'Choose the Right Configuration', null::text, 'Key strengths'),
      (3, 'IDS Setup and Support', null::text, 'Property considerations and limitations'),
      (4, null::text, 'Verified specifications', 'Specifications'),
      (5, null::text, '5A versus 10A configurations', '5A and 10A mower configurations'),
      (6, null::text, null::text, 'Included equipment'),
      (7, null::text, 'Compatible accessories', 'Replacement and optional accessories'),
      (8, null::text, 'Warranty summary', 'Warranty')
  )
  select string_agg(
    format(
      'sort_order %s: %s',
      section.sort_order,
      coalesce(section.heading, '<no heading>')
    ),
    '; '
    order by section.sort_order, section.heading
  )
  into collision_summary
  from public.catalog_product_page_sections section
  join public.catalog_product_pages page on page.id = section.product_page_id
  join public.catalog_products product on product.id = page.product_id
  where product.slug = 'lymow-one-plus'
    and product.brand = 'Lymow'
    and section.sort_order between 1 and 8
    and not (
      section.section_type = 'content'
      and exists (
        select 1
        from proposed_sections proposed
        where section.heading in (
          proposed.final_heading,
          proposed.legacy_heading,
          proposed.prior_heading
        )
      )
    );

  if collision_summary is not null then
    raise notice 'Preserved unexpected Lymow page sections at desired positions: %. Missing reviewed sections will be appended after the current highest sort_order; manual layout review is recommended.', collision_summary;
  end if;
end
$section_review$;

-- Product card, overview, capability, daily-output guidance, and property
-- considerations. Daily coverage is not a whole-property size rating.
with proposed(
  homepage_summary,
  full_description,
  capability_level,
  property_scale,
  customer_guidance
) as (
  values (
    'Lymow One Plus combines a 16-inch dual-rotary cutting system, tracked drive, RTK + VSLAM virtual-boundary navigation, and sensor-assisted obstacle avoidance. It is offered in 5A and 10A mower configurations with different charge times and estimated daily mowing coverage.',
    'Lymow One Plus is a virtual-boundary robotic mower for segmented, sloped, uneven, or multi-zone residential lawns. Its tracked drive and 16-inch dual-rotary cutting system support a 1.2–4.0-inch cutting-height range, while RTK + VSLAM navigation, app management for up to 80 zones, AI vision, ultrasonic sensing, automatic recharge, and resume capability support automated mowing across mapped zones. The mower is offered in 5A and 10A configurations with different charge times and manufacturer-stated estimated daily mowing coverage.',
    'Tracked, virtual-boundary robotic mowing',
    'Manufacturer-stated estimated daily mowing coverage: up to 1.1 acres per day with the 5A configuration or up to 1.73 acres per day with the 10A configuration. These figures are daily operating estimates, not whole-property size ratings.',
    'Choose between the 5A and 10A mower configurations using estimated daily mowing demand, terrain, zone count, charging cadence, and RTK placement. The 15-acre figure is map-storage capacity, not mowing capacity or a whole-property acreage recommendation.'
  )
)
update public.catalog_products product
set homepage_summary = proposed.homepage_summary,
    full_description = proposed.full_description,
    capability_level = proposed.capability_level,
    property_scale = proposed.property_scale,
    customer_guidance = proposed.customer_guidance,
    updated_at = now()
from proposed
where product.slug = 'lymow-one-plus'
  and product.brand = 'Lymow'
  and row(
    product.homepage_summary,
    product.full_description,
    product.capability_level,
    product.property_scale,
    product.customer_guidance
  ) is distinct from row(
    proposed.homepage_summary,
    proposed.full_description,
    proposed.capability_level,
    proposed.property_scale,
    proposed.customer_guidance
  );

-- Hero copy only. Pricing, SEO, publication state, and media remain unchanged.
with proposed(hero_heading, hero_subheading) as (
  values (
    'Lymow One Plus: Tracked Power for Complex Lawns',
    'A tracked robotic mower with RTK + VSLAM virtual-boundary navigation, a 16-inch dual-rotary cutting system, and 5A or 10A mower configurations for different daily mowing demands.'
  )
)
update public.catalog_product_pages page
set hero_heading = proposed.hero_heading,
    hero_subheading = proposed.hero_subheading,
    updated_at = now()
from public.catalog_products product, proposed
where page.product_id = product.id
  and product.slug = 'lymow-one-plus'
  and product.brand = 'Lymow'
  and row(page.hero_heading, page.hero_subheading)
      is distinct from row(proposed.hero_heading, proposed.hero_subheading);

-- Update only positively identified Lymow sections. Insert each missing
-- section after the page's current highest sort order so an unexpected row is
-- never overwritten or moved. The table lock makes this check/insert atomic.
with lymow_page as (
  select page.id, page.is_published
  from public.catalog_product_pages page
  join public.catalog_products product on product.id = page.product_id
  where product.slug = 'lymow-one-plus'
    and product.brand = 'Lymow'
),
proposed_sections(
  logical_order,
  legacy_heading,
  prior_heading,
  heading,
  body_content
) as (
  values
    (
      1,
      'Residential Autonomous Mowing',
      null::text,
      'Product overview',
      $section$Lymow One Plus uses tracked drive and RTK + VSLAM virtual-boundary navigation to automate mowing across segmented, sloped, uneven, or multi-zone lawns. Its 16-inch dual-rotary cutting system supports cutting heights from 1.2 to 4.0 inches, while AI vision, ultrasonic sensing, automatic recharge, and resume capability support operation across mapped zones.

The mower is offered in 5A and 10A configurations. Each mower package includes the mower, charging station, one charging-station adapter, charging extension cable, RTK hardware, mounting hardware, and printed guides. Separately sold batteries, tracks, charging adapters, cables, and RTK components are replacement or optional accessories rather than required additions to configure the mower.$section$
    ),
    (
      2,
      'Choose the Right Configuration',
      null::text,
      'Key strengths',
      $section$• Tracked drive with manufacturer-rated slope handling up to 45° (100% incline) and obstacle crossing up to 2.8 in.
• 16-inch dual-rotary cutting system with a 1.2–4.0-inch cutting-height range.
• RTK + VSLAM navigation with virtual boundaries instead of a perimeter wire.
• App management for up to 80 zones.
• AI vision, 5 ultrasonic sensors, 2 Hall sensors, and automatic recharge/resume.
• LiFePO₄ battery with up to 3 hours of runtime and a manufacturer-stated 2,000-charge-cycle rating.
• IPX6 water-resistance rating.$section$
    ),
    (
      3,
      'IDS Setup and Support',
      null::text,
      'Property considerations and limitations',
      $section$• Manufacturer-stated estimated daily mowing coverage is up to 1.1 acres per day with the 5A configuration and up to 1.73 acres per day with the 10A configuration. These are daily operating estimates, not maximum lawn-size or whole-property acreage ratings.
• Maximum slope and coverage are manufacturer-rated figures, and actual results vary with terrain, grass density, weather, routing, and operating conditions.
• Reliable RTK-guided operation requires a suitable RTK reference-station location. Without RTK, Lymow lists 0.025–0.037 acres of mowing area and up to 10 minutes of mowing time.
• The minimum cutting height is 1.2 in.
• The mower weighs 78.5 lb ±1 lb; access, transport, recovery, and service planning should account for that weight.
• Map storage of 15 acres is not a daily mowing-capacity or property-size rating.
• Lymow One and Lymow One Plus batteries and blades are not interchangeable.$section$
    ),
    (
      4,
      null::text,
      'Verified specifications',
      'Specifications',
      $section$Navigation: RTK + VSLAM
RTK coverage radius: up to 3,200 ft
Operation without RTK: 0.025–0.037 acres; up to 10 minutes
Map storage: 15 acres
Multi-zone management: up to 80 zones
Connectivity: Bluetooth, Wi-Fi, and 4G
Cliff detection: 2 Hall sensors
Obstacle avoidance: AI vision, 5 ultrasonic sensors, and 2 Hall sensors
Slope handling: up to 45° (100% incline)
Obstacle crossing: up to 2.8 in*
Blade system: rotary mulching blades; dual-rotary cutting system
Mowing speed: 1.0–3.3 ft/s
Cutting height: 1.2–4.0 in
Cutting width: 16 in
Blade speed: 3,000–6,000 RPM*
Rated / peak power: 680 W / 1,785 W
Maximum mowing coverage per hour: 0.23 acres
Maximum mowing coverage per charge: 0.57 acres
Battery: LiFePO₄; 15,000 mAh (15 Ah); 35.2 V
Maximum runtime: up to 3 hours
Battery-life rating: 2,000 charge cycles*
Water resistance: IPX6
Product weight: 78.5 lb ±1 lb
Product dimensions: 29.5 × 23.6 × 12.6 in (L × W × H)

*Lymow identifies the starred specification-table values as laboratory measurements; actual performance can vary with use and environment.$section$
    ),
    (
      5,
      null::text,
      '5A versus 10A configurations',
      '5A and 10A mower configurations',
      $section$5A mower configuration
• Charging voltage: 39 V
• Charge time: 150 minutes from 10% to 90%
• Manufacturer-stated estimated daily mowing coverage: up to 1.1 acres per day

10A mower configuration
• Charging voltage: 40.5 V
• Charge time: 90 minutes from 10% to 90%
• Manufacturer-stated estimated daily mowing coverage: up to 1.73 acres per day

Select either the 5A or 10A mower configuration. The corresponding charging configuration is associated with the selected mower; no additional charger-selection step is required.$section$
    ),
    (
      6,
      null::text,
      null::text,
      'Included equipment',
      $section$Lymow One Plus ×1
Charging station ×1
Charging-station adapter ×1
Charging-station extension cable, 10 m ×1
Charging-station ground stakes ×4
RTK reference station ×1
Radio antenna ×1
Mounting poles ×2
Wall-mount bracket ×1
RTK ground stake ×1
Expansion bolts ×4
RTK power adapter ×1
RTK station extension cables, 5 m ×2
User manual ×1
Quick-start guide ×1

The separately sold charging adapters, charging cables, and RTK components are replacement or optional accessories. The charging and RTK equipment listed above is included with the mower package.$section$
    ),
    (
      7,
      null::text,
      'Compatible accessories',
      'Replacement and optional accessories',
      $section$• Lymow One Plus Battery: separately sold replacement battery designed for Lymow One Plus; not compatible with Lymow One.
• Battery Direct Charging Cable: separately sold optional direct-charging cable designed for the Lymow One Plus battery; not compatible with the Lymow One battery.
• Replacement Lymow Track: separately sold replacement track compatible with Lymow One and Lymow One Plus.
• RTK Reference Station: separately sold replacement or additional set containing one RTK reference station and one antenna; compatible with Lymow One and Lymow One Plus.
• RTK Power Adapter: separately sold replacement or additional RTK power adapter compatible with Lymow One and Lymow One Plus.
• RTK Station Extension Cable: separately sold replacement or additional extension cable compatible with Lymow One and Lymow One Plus.
• 5A Charging Station Adapter: separately sold replacement or additional adapter compatible with Lymow One and Lymow One Plus; includes a 10 m extension cable.
• 10A Charging Station Adapter: separately sold replacement or additional adapter compatible with Lymow One and Lymow One Plus; includes a 10 m extension cable.$section$
    ),
    (
      8,
      null::text,
      'Warranty summary',
      'Warranty',
      $section$Lymow lists a 3-year limited warranty for Lymow One Plus, excluding tracks and blades; tracks and blades have no warranty. Coverage is tied to the mower serial number and limited to the original purchase country or region. Misuse, modification, improper maintenance, commercial use, unauthorized repair, cosmetic damage, and normal wear are excluded. Customers purchasing through a dealer or retailer should follow that seller's claim process. Full manufacturer terms apply.$section$
    )
),
identified_sections as (
  select
    section.id,
    section.sort_order,
    proposed.logical_order,
    proposed.heading,
    proposed.body_content
  from lymow_page
  join public.catalog_product_page_sections section
    on section.product_page_id = lymow_page.id
   and section.section_type = 'content'
  join proposed_sections proposed
    on section.heading in (
      proposed.heading,
      proposed.legacy_heading,
      proposed.prior_heading
    )
),
updated_sections as (
  update public.catalog_product_page_sections section
  set section_type = 'content',
      heading = identified.heading,
      body_content = identified.body_content,
      is_published = lymow_page.is_published,
      updated_at = now()
  from lymow_page, identified_sections identified
  where section.id = identified.id
    and row(
      section.section_type,
      section.heading,
      section.body_content,
      section.is_published
    ) is distinct from row(
      'content',
      identified.heading,
      identified.body_content,
      lymow_page.is_published
    )
  returning section.id
),
current_max_sort as (
  select greatest(coalesce(max(section.sort_order), 0), 0) as value
  from lymow_page
  left join public.catalog_product_page_sections section
    on section.product_page_id = lymow_page.id
),
missing_sections as (
  select
    proposed.logical_order,
    proposed.heading,
    proposed.body_content,
    row_number() over (order by proposed.logical_order) as missing_rank
  from proposed_sections proposed
  where not exists (
    select 1
    from identified_sections identified
    where identified.logical_order = proposed.logical_order
  )
),
inserted_sections as (
  insert into public.catalog_product_page_sections (
    product_page_id,
    section_type,
    heading,
    body_content,
    sort_order,
    is_published,
    updated_at
  )
  select
    lymow_page.id,
    'content',
    missing.heading,
    missing.body_content,
    current_max_sort.value + missing.missing_rank::integer,
    lymow_page.is_published,
    now()
  from lymow_page
  cross join current_max_sort
  cross join missing_sections missing
  returning id
)
select
  (select count(*) from updated_sections) as sections_updated,
  (select count(*) from inserted_sections) as sections_inserted;

-- The mower variant remains the only charging/configuration decision.
with lymow_product as (
  select id
  from public.catalog_products
  where slug = 'lymow-one-plus'
    and brand = 'Lymow'
),
proposed_variants(variant_slug, description) as (
  values
    (
      'lymow-one-plus-5a',
      'Lymow One Plus 5A mower configuration. Manufacturer-stated charge time: 150 minutes from 10% to 90%. Manufacturer-stated estimated daily mowing coverage: up to 1.1 acres per day.'
    ),
    (
      'lymow-one-plus-10a',
      'Lymow One Plus 10A mower configuration. Manufacturer-stated charge time: 90 minutes from 10% to 90%. Manufacturer-stated estimated daily mowing coverage: up to 1.73 acres per day.'
    )
)
update public.catalog_product_variants variant
set description = proposed.description,
    updated_at = now()
from lymow_product product, proposed_variants proposed
where variant.product_id = product.id
  and variant.variant_slug = proposed.variant_slug
  and variant.description is distinct from proposed.description;

-- Hide only the two configuration mirrors. Normalize finished customer copy
-- for active replacement and optional equipment. The track stays visible and
-- is named so the existing name-based catalog classifier places it in
-- Replacement Parts without asserting an unverified package quantity.
with lymow_product as (
  select id
  from public.catalog_products
  where slug = 'lymow-one-plus'
    and brand = 'Lymow'
),
proposed_options(option_slug, proposed_name, description, proposed_status) as (
  values
    (
      'lymow-5a-charger',
      null::text,
      '5A charging configuration for the Lymow One Plus 5A mower.',
      'hidden'
    ),
    (
      'lymow-10a-charger',
      null::text,
      '10A charging configuration for the Lymow One Plus 10A mower.',
      'hidden'
    ),
    (
      'lymow-battery-528wh',
      'Lymow One Plus Battery',
      'Separately sold replacement battery designed for Lymow One Plus. Not compatible with Lymow One.',
      null::text
    ),
    (
      'lymow-straight-blade-2',
      null::text,
      'Replacement straight blade for Lymow One Plus.',
      null::text
    ),
    (
      'lymow-tracks-pair',
      'Replacement Lymow Track',
      'Separately sold replacement track compatible with Lymow One and Lymow One Plus.',
      null::text
    ),
    (
      'lymow-rtk-reference-station',
      null::text,
      'Separately sold replacement or additional set containing one RTK reference station and one antenna. Compatible with Lymow One and Lymow One Plus.',
      null::text
    ),
    (
      'lymow-battery-direct-charging-cable',
      null::text,
      'Separately sold optional direct-charging cable designed for the Lymow One Plus battery. Not compatible with the Lymow One battery.',
      null::text
    ),
    (
      'lymow-rtk-extension-cable',
      null::text,
      'Separately sold replacement or additional RTK station extension cable compatible with Lymow One and Lymow One Plus.',
      null::text
    ),
    (
      'lymow-rtk-power-adapter',
      null::text,
      'Separately sold replacement or additional RTK power adapter compatible with Lymow One and Lymow One Plus.',
      null::text
    ),
    (
      'lymow-10a-charging-station-adapter',
      null::text,
      'Separately sold replacement or additional 10A charging-station adapter compatible with Lymow One and Lymow One Plus. Includes a 10 m extension cable.',
      null::text
    ),
    (
      'lymow-5a-charging-station-adapter',
      null::text,
      'Separately sold replacement or additional 5A charging-station adapter compatible with Lymow One and Lymow One Plus. Includes a 10 m extension cable.',
      null::text
    )
)
update public.catalog_options option
set name = coalesce(proposed.proposed_name, option.name),
    description = proposed.description,
    public_status = coalesce(proposed.proposed_status, option.public_status),
    updated_at = now()
from lymow_product product, proposed_options proposed
where option.product_id = product.id
  and option.option_slug = proposed.option_slug
  and row(
    option.name,
    option.description,
    option.public_status
  ) is distinct from row(
    coalesce(proposed.proposed_name, option.name),
    proposed.description,
    coalesce(proposed.proposed_status, option.public_status)
  );

-- Prevent a noncooperating writer from adding a crossed or wrong-type charger
-- link between relationship validation and the conflict-safe upsert.
lock table public.catalog_variant_options
in share row exclusive mode;

-- Reject conflicting charger relationships rather than layering a second
-- meaning onto the same variant/option pair.
do $relationship_review$
begin
  if exists (
    select 1
    from public.catalog_variant_options link
    join public.catalog_product_variants variant on variant.id = link.variant_id
    join public.catalog_options option on option.id = link.option_id
    join public.catalog_products product
      on product.id = variant.product_id
     and product.id = option.product_id
    where product.slug = 'lymow-one-plus'
      and product.brand = 'Lymow'
      and (
        (variant.variant_slug = 'lymow-one-plus-5a'
          and option.option_slug = 'lymow-10a-charger')
        or
        (variant.variant_slug = 'lymow-one-plus-10a'
          and option.option_slug = 'lymow-5a-charger')
        or
        (
          (
            (variant.variant_slug = 'lymow-one-plus-5a'
              and option.option_slug = 'lymow-5a-charger')
            or
            (variant.variant_slug = 'lymow-one-plus-10a'
              and option.option_slug = 'lymow-10a-charger')
          )
          and link.relationship_type <> 'defines_variant'
        )
      )
  ) then
    raise exception 'Conflicting Lymow charger relationship found. Manual review is required before this proposal can run.';
  end if;
end
$relationship_review$;

-- Make the two variant/configuration relationships explicit. The conflict
-- branch updates only a semantically different quantity, so run two is a no-op.
with lymow_product as (
  select id
  from public.catalog_products
  where slug = 'lymow-one-plus'
    and brand = 'Lymow'
),
proposed_links(variant_slug, option_slug) as (
  values
    ('lymow-one-plus-5a', 'lymow-5a-charger'),
    ('lymow-one-plus-10a', 'lymow-10a-charger')
),
resolved_links as (
  select variant.id as variant_id, option.id as option_id
  from lymow_product product
  join public.catalog_product_variants variant on variant.product_id = product.id
  join proposed_links proposed on proposed.variant_slug = variant.variant_slug
  join public.catalog_options option
    on option.product_id = product.id
   and option.option_slug = proposed.option_slug
)
insert into public.catalog_variant_options as existing (
  variant_id,
  option_id,
  relationship_type,
  quantity,
  updated_at
)
select
  variant_id,
  option_id,
  'defines_variant',
  1,
  now()
from resolved_links
on conflict (variant_id, option_id, relationship_type)
do update
set quantity = excluded.quantity,
    updated_at = now()
where existing.quantity is distinct from excluded.quantity;

commit;
