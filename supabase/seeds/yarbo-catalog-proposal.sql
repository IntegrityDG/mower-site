-- REVIEW ONLY: Yarbo catalog merchandising proposal.
-- Do not execute during the Yarbo review/proposal phase.
-- This file intentionally ends with ROLLBACK so an accidental full-file
-- execution in one session should not persist changes.
--
-- Final IDS merchandising direction:
-- - Complete Yarbo Packages
-- - Individual Yarbo Equipment
-- - No guided Yarbo module configurator
-- - No automatic package matching
-- - No new-owner/existing-owner entry choice
--
-- Scope: public Yarbo catalog copy, package names/descriptions, option names,
-- visibility recommendations, and module quantity limits.
-- No pricing, promotions, services, service-area logic, delivery eligibility,
-- media, package-item relationships, variant-option relationships, private
-- monitoring tables, candidate statuses, RLS, grants, permissions, Lymow,
-- Pandag, checkout, financing, payment, or unrelated products.
--
-- Proposed public tables/columns affected if this proposal is later approved:
-- - public.catalog_products:
--   name, homepage_summary, full_description, capability_level, property_scale,
--   customer_guidance, updated_at
-- - public.catalog_product_pages:
--   seo_title, seo_description, hero_heading, hero_subheading,
--   long_form_content, is_published, updated_at
-- - public.catalog_product_page_sections:
--   section_type, heading, body_content, button_label, button_url, sort_order,
--   is_published, updated_at
-- - public.catalog_option_groups:
--   group_name, group_description, selection_type, is_required,
--   minimum_selections, maximum_selections, updated_at
-- - public.catalog_options:
--   name, description, public_status, is_required, is_included, is_recommended,
--   default_quantity, minimum_quantity, maximum_quantity, updated_at
-- - public.catalog_packages:
--   package_name, description, updated_at

BEGIN;

WITH yarbo_product AS (
  SELECT id
  FROM public.catalog_products
  WHERE slug = 'yarbo'
)
UPDATE public.catalog_products p
SET
  name = 'Yarbo Core',
  homepage_summary = 'A modular outdoor robot platform for complete Yarbo packages and individual Core-based equipment.',
  full_description = 'Yarbo Core is the powered base robot for the Yarbo Y Series. It supplies the tracked drive platform, app control, navigation foundation, battery and charging equipment, Data Center, and platform foundation used by compatible Yarbo modules.',
  capability_level = 'Modular year-round outdoor platform',
  property_scale = 'Large, complex, or multi-season properties',
  customer_guidance = 'Choose a complete Yarbo package when you want Core and modules together, or choose individual Yarbo equipment when manually assembling a system or adding seasonal capability. Module-only equipment requires Yarbo Core.',
  updated_at = now()
FROM yarbo_product yp
WHERE p.id = yp.id
  AND (
    p.name,
    p.homepage_summary,
    p.full_description,
    p.capability_level,
    p.property_scale,
    p.customer_guidance
  ) IS DISTINCT FROM (
    'Yarbo Core',
    'A modular outdoor robot platform for complete Yarbo packages and individual Core-based equipment.',
    'Yarbo Core is the powered base robot for the Yarbo Y Series. It supplies the tracked drive platform, app control, navigation foundation, battery and charging equipment, Data Center, and platform foundation used by compatible Yarbo modules.',
    'Modular year-round outdoor platform',
    'Large, complex, or multi-season properties',
    'Choose a complete Yarbo package when you want Core and modules together, or choose individual Yarbo equipment when manually assembling a system or adding seasonal capability. Module-only equipment requires Yarbo Core.'
  );

WITH yarbo_product AS (
  SELECT id
  FROM public.catalog_products
  WHERE slug = 'yarbo'
)
INSERT INTO public.catalog_product_pages (
  product_id,
  seo_title,
  seo_description,
  hero_heading,
  hero_subheading,
  long_form_content,
  is_published,
  updated_at
)
SELECT
  yp.id,
  'Yarbo Core Packages and Individual Equipment | IDS',
  'Shop complete Yarbo packages or individual Yarbo Core-based equipment for mowing, snow clearing, blowing, trimming, and year-round outdoor care.',
  'Yarbo Core powers modular outdoor care across seasons.',
  'Choose from complete Yarbo packages or individual Yarbo equipment. Complete packages include Yarbo Core and the listed modules. Individual modules are sold separately for customers who already have Core or want to assemble a custom system manually.',
  'Yarbo is a modular outdoor equipment platform. IDS presents Yarbo in two straightforward sections: Complete Yarbo Packages and Individual Yarbo Equipment. Complete packages include Yarbo Core, Core charging/navigation equipment, and the listed modules. Individual module-only equipment requires a Yarbo Core to operate.',
  true,
  now()
FROM yarbo_product yp
ON CONFLICT (product_id) DO UPDATE
SET
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  hero_heading = excluded.hero_heading,
  hero_subheading = excluded.hero_subheading,
  long_form_content = excluded.long_form_content,
  is_published = excluded.is_published,
  updated_at = now()
WHERE (
  public.catalog_product_pages.seo_title,
  public.catalog_product_pages.seo_description,
  public.catalog_product_pages.hero_heading,
  public.catalog_product_pages.hero_subheading,
  public.catalog_product_pages.long_form_content,
  public.catalog_product_pages.is_published
) IS DISTINCT FROM (
  excluded.seo_title,
  excluded.seo_description,
  excluded.hero_heading,
  excluded.hero_subheading,
  excluded.long_form_content,
  excluded.is_published
);

WITH yarbo_page AS (
  SELECT pp.id
  FROM public.catalog_product_pages pp
  JOIN public.catalog_products p ON p.id = pp.product_id
  WHERE p.slug = 'yarbo'
)
DELETE FROM public.catalog_product_page_sections s
USING yarbo_page yp
WHERE s.product_page_id = yp.id;

WITH yarbo_page AS (
  SELECT pp.id
  FROM public.catalog_product_pages pp
  JOIN public.catalog_products p ON p.id = pp.product_id
  WHERE p.slug = 'yarbo'
),
sections (
  section_type,
  heading,
  body_content,
  button_label,
  button_url,
  sort_order
) AS (
  VALUES
    (
      'overview',
      'Yarbo Platform Introduction',
      'Yarbo Core is the powered base robot for modular outdoor care across seasons. Customers can shop complete Yarbo packages or individual Yarbo equipment without using an automatic package matcher.',
      'Contact IDS About Yarbo',
      '/#location-and-customer-path',
      10
    ),
    (
      'packages',
      'Complete Yarbo Packages',
      'Complete Yarbo packages include Yarbo Core, Core charging equipment, Core navigation/RTK-related equipment, and the modules listed on each package card. Package cards display the current IDS catalog package price.',
      'View Yarbo Packages',
      '/#location-and-customer-path',
      20
    ),
    (
      'package_groups',
      'Package Categories',
      'Group packages as Mowing Systems, Mower Pro Systems, Snow Systems, Cleanup and Trimming Systems, Multi-Season Systems, and Full Property-Care Systems. Do not show all 23 packages as one unorganized list.',
      'Compare Package Groups',
      '/#location-and-customer-path',
      30
    ),
    (
      'individual_equipment',
      'Individual Yarbo Equipment',
      'Individual Yarbo Equipment includes Yarbo Core, Standard Lawn Mower Module, Lawn Mower Pro Module, Snow Blower Module, Blower Module, and Yarbo Trimmer Package. Module-only equipment can be purchased by existing Core owners, customers manually assembling a custom system, or customers adding seasonal capability.',
      'Request Individual Equipment',
      '/#location-and-customer-path',
      40
    ),
    (
      'core_required_notice',
      'Module-Only Equipment Notice',
      'Every module-only item must prominently state: Module only — requires a Yarbo Core to operate. Place the notice on cards, detail content, quantity/order lines, and request summaries.',
      'Ask IDS About Compatibility',
      '/#location-and-customer-path',
      50
    ),
    (
      'included_equipment',
      'Included Charging And Navigation Equipment',
      'Complete Yarbo packages include the Core equipment needed for the platform foundation, including charging and docking equipment, battery equipment, Data Center/navigation equipment, and installation/tool equipment where included by the official Core package. Do not list these as extra optional package selections.',
      'Review Included Equipment',
      '/#location-and-customer-path',
      60
    ),
    (
      'warranty_ownership',
      'Warranty And Ownership Guidance',
      'Official Yarbo pages reviewed in this phase consistently show 2-Year Warranty, 30-Day Hassle-Free Returns, and 24/7 Support. IDS should verify dealer-specific handling before final publication. Module-only equipment requires Yarbo Core.',
      'Contact IDS About Yarbo',
      '/#location-and-customer-path',
      70
    )
)
INSERT INTO public.catalog_product_page_sections (
  product_page_id,
  section_type,
  heading,
  body_content,
  button_label,
  button_url,
  sort_order,
  is_published,
  updated_at
)
SELECT
  yp.id,
  s.section_type,
  s.heading,
  s.body_content,
  s.button_label,
  s.button_url,
  s.sort_order,
  true,
  now()
FROM yarbo_page yp
CROSS JOIN sections s;

WITH yarbo_product AS (
  SELECT id
  FROM public.catalog_products
  WHERE slug = 'yarbo'
)
UPDATE public.catalog_option_groups g
SET
  group_name = 'Individual Yarbo Equipment',
  group_description = 'Individual Yarbo equipment for Core-based systems. Module-only items require a Yarbo Core to operate and should be limited to one per order line.',
  selection_type = 'multiple',
  is_required = false,
  minimum_selections = 0,
  maximum_selections = null,
  updated_at = now()
FROM yarbo_product yp
WHERE g.product_id = yp.id
  AND g.group_slug = 'yarbo-modules'
  AND (
    g.group_name,
    g.group_description,
    g.selection_type,
    g.is_required,
    g.minimum_selections,
    g.maximum_selections
  ) IS DISTINCT FROM (
    'Individual Yarbo Equipment',
    'Individual Yarbo equipment for Core-based systems. Module-only items require a Yarbo Core to operate and should be limited to one per order line.',
    'multiple',
    false,
    0,
    NULL::integer
  );

WITH yarbo_product AS (
  SELECT id
  FROM public.catalog_products
  WHERE slug = 'yarbo'
),
option_updates (
  option_slug,
  name,
  description,
  public_status,
  is_required,
  is_included,
  is_recommended,
  default_quantity,
  minimum_quantity,
  maximum_quantity
) AS (
  VALUES
    (
      'yarbo-mower-module',
      'Standard Lawn Mower Module',
      'Standard Yarbo mowing module for Core-based autonomous lawn care. Module only — requires a Yarbo Core to operate.',
      'active',
      false,
      false,
      false,
      0,
      0,
      1
    ),
    (
      'yarbo-lawn-mower-pro-module',
      'Lawn Mower Pro Module',
      'Higher-output Yarbo mowing module for tougher grass, lower cut-height goals, and demanding lawn conditions. Module only — requires a Yarbo Core to operate.',
      'active',
      false,
      false,
      false,
      0,
      0,
      1
    ),
    (
      'yarbo-snow-blower-module',
      'Snow Blower Module',
      'Two-stage Yarbo snow-clearing module for Core-based winter routes. Module only — requires a Yarbo Core to operate.',
      'active',
      false,
      false,
      false,
      0,
      0,
      1
    ),
    (
      'yarbo-leaf-blower-module',
      'Blower Module',
      'Yarbo blower module for leaves, light debris, and seasonal cleanup routes. Module only — requires a Yarbo Core to operate.',
      'active',
      false,
      false,
      false,
      0,
      0,
      1
    ),
    (
      'yarbo-trimmer-module',
      'Yarbo Trimmer Package',
      'Yarbo trimmer package with Back Brace Mount connection for edge and detail trimming. Module only — requires a Yarbo Core to operate. Availability should be manually verified before publication.',
      'active',
      false,
      false,
      false,
      0,
      0,
      1
    ),
    (
      'yarbo-plow-module',
      'Yarbo Snow Plow Blade',
      'Keep hidden until IDS separately approves compatibility, sales classification, package relationships, and customer-facing use cases.',
      'hidden',
      false,
      false,
      false,
      0,
      0,
      1
    ),
    (
      'yarbo-tow-hitch',
      'Yarbo Tow Hitch',
      'Keep hidden as standalone equipment unless IDS separately approves replacement or extra tow-hitch merchandising. Official Core source says Tow Hitch is included with Core.',
      'hidden',
      false,
      false,
      false,
      0,
      0,
      1
    )
)
UPDATE public.catalog_options o
SET
  name = u.name,
  description = u.description,
  public_status = u.public_status,
  is_required = u.is_required,
  is_included = u.is_included,
  is_recommended = u.is_recommended,
  default_quantity = u.default_quantity,
  minimum_quantity = u.minimum_quantity,
  maximum_quantity = u.maximum_quantity,
  updated_at = now()
FROM yarbo_product yp
JOIN option_updates u ON true
WHERE o.product_id = yp.id
  AND o.option_slug = u.option_slug
  AND (
    o.name,
    o.description,
    o.public_status,
    o.is_required,
    o.is_included,
    o.is_recommended,
    o.default_quantity,
    o.minimum_quantity,
    o.maximum_quantity
  ) IS DISTINCT FROM (
    u.name,
    u.description,
    u.public_status,
    u.is_required,
    u.is_included,
    u.is_recommended,
    u.default_quantity,
    u.minimum_quantity,
    u.maximum_quantity
  );

WITH yarbo_product AS (
  SELECT id
  FROM public.catalog_products
  WHERE slug = 'yarbo'
),
package_updates (package_slug, package_name, description) AS (
  VALUES
    ('yarbo-lawn-mower', 'Yarbo Lawn Mower System', 'Complete Mowing Systems package. Includes Yarbo Core, Core charging/navigation equipment, and Standard Lawn Mower Module.'),
    ('yarbo-lawn-mower-trimmer', 'Yarbo Lawn Mower + Trimmer System', 'Complete Mowing Systems package. Includes Yarbo Core, Core charging/navigation equipment, Standard Lawn Mower Module, and Yarbo Trimmer Package.'),
    ('yarbo-lawn-leaf', 'Yarbo Lawn Mower + Blower System', 'Complete Mowing Systems package. Includes Yarbo Core, Core charging/navigation equipment, Standard Lawn Mower Module, and Blower Module.'),
    ('yarbo-lawn-leaf-trimmer', 'Yarbo Lawn Mower + Blower + Trimmer System', 'Complete Mowing Systems package. Includes Yarbo Core, Core charging/navigation equipment, Standard Lawn Mower Module, Blower Module, and Yarbo Trimmer Package.'),
    ('yarbo-lawn-mower-pro', 'Yarbo Lawn Mower Pro System', 'Complete Mower Pro Systems package. Includes Yarbo Core, Core charging/navigation equipment, and Lawn Mower Pro Module.'),
    ('yarbo-lawn-mower-pro-trimmer', 'Yarbo Lawn Mower Pro + Trimmer System', 'Complete Mower Pro Systems package. Includes Yarbo Core, Core charging/navigation equipment, Lawn Mower Pro Module, and Yarbo Trimmer Package.'),
    ('yarbo-pro-leaf', 'Yarbo Lawn Mower Pro + Blower System', 'Complete Mower Pro Systems package. Includes Yarbo Core, Core charging/navigation equipment, Lawn Mower Pro Module, and Blower Module.'),
    ('yarbo-pro-leaf-trimmer', 'Yarbo Lawn Mower Pro + Blower + Trimmer System', 'Complete Mower Pro Systems package. Includes Yarbo Core, Core charging/navigation equipment, Lawn Mower Pro Module, Blower Module, and Yarbo Trimmer Package.'),
    ('yarbo-snow-blower', 'Yarbo Snow Blower System', 'Complete Snow Systems package. Includes Yarbo Core, Core charging/navigation equipment, and Snow Blower Module.'),
    ('yarbo-snow-blower-trimmer', 'Yarbo Snow Blower + Trimmer System', 'Complete Snow Systems package. Includes Yarbo Core, Core charging/navigation equipment, Snow Blower Module, and Yarbo Trimmer Package.'),
    ('yarbo-snow-leaf', 'Yarbo Snow Blower + Blower System', 'Complete Snow Systems package. Includes Yarbo Core, Core charging/navigation equipment, Snow Blower Module, and Blower Module.'),
    ('yarbo-snow-leaf-trimmer', 'Yarbo Snow Blower + Blower + Trimmer System', 'Complete Snow Systems package. Includes Yarbo Core, Core charging/navigation equipment, Snow Blower Module, Blower Module, and Yarbo Trimmer Package.'),
    ('yarbo-leaf-blower', 'Yarbo Blower System', 'Complete Cleanup And Trimming Systems package. Includes Yarbo Core, Core charging/navigation equipment, and Blower Module.'),
    ('yarbo-trimmer', 'Yarbo Trimmer System', 'Complete Cleanup And Trimming Systems package. Includes Yarbo Core, Core charging/navigation equipment, and Yarbo Trimmer Package.'),
    ('yarbo-leaf-blower-trimmer', 'Yarbo Blower + Trimmer System', 'Complete Cleanup And Trimming Systems package. Includes Yarbo Core, Core charging/navigation equipment, Blower Module, and Yarbo Trimmer Package.'),
    ('yarbo-snow-lawn', 'Yarbo Snow Blower + Lawn Mower System', 'Complete Multi-Season Systems package. Includes Yarbo Core, Core charging/navigation equipment, Snow Blower Module, and Standard Lawn Mower Module.'),
    ('yarbo-snow-lawn-trimmer', 'Yarbo Snow Blower + Lawn Mower + Trimmer System', 'Complete Multi-Season Systems package. Includes Yarbo Core, Core charging/navigation equipment, Snow Blower Module, Standard Lawn Mower Module, and Yarbo Trimmer Package.'),
    ('yarbo-pro-snow', 'Yarbo Lawn Mower Pro + Snow Blower System', 'Complete Multi-Season Systems package. Includes Yarbo Core, Core charging/navigation equipment, Lawn Mower Pro Module, and Snow Blower Module.'),
    ('yarbo-pro-snow-trimmer', 'Yarbo Lawn Mower Pro + Snow Blower + Trimmer System', 'Complete Multi-Season Systems package. Includes Yarbo Core, Core charging/navigation equipment, Lawn Mower Pro Module, Snow Blower Module, and Yarbo Trimmer Package.'),
    ('yarbo-lawn-snow-leaf', 'Yarbo Lawn Mower + Snow Blower + Blower System', 'Complete Multi-Season Systems package. Includes Yarbo Core, Core charging/navigation equipment, Standard Lawn Mower Module, Snow Blower Module, and Blower Module.'),
    ('yarbo-pro-snow-leaf', 'Yarbo Lawn Mower Pro + Snow Blower + Blower System', 'Complete Multi-Season Systems package. Includes Yarbo Core, Core charging/navigation equipment, Lawn Mower Pro Module, Snow Blower Module, and Blower Module.'),
    ('yarbo-lawn-snow-leaf-trimmer', 'Yarbo Lawn Mower + Snow Blower + Blower + Trimmer System', 'Complete Full Property-Care Systems package. Includes Yarbo Core, Core charging/navigation equipment, Standard Lawn Mower Module, Snow Blower Module, Blower Module, and Yarbo Trimmer Package.'),
    ('yarbo-pro-snow-leaf-trimmer', 'Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer System', 'Complete Full Property-Care Systems package. Includes Yarbo Core, Core charging/navigation equipment, Lawn Mower Pro Module, Snow Blower Module, Blower Module, and Yarbo Trimmer Package.')
)
UPDATE public.catalog_packages pkg
SET
  package_name = u.package_name,
  description = u.description,
  updated_at = now()
FROM yarbo_product yp
JOIN package_updates u ON true
WHERE pkg.product_id = yp.id
  AND pkg.package_slug = u.package_slug
  AND (
    pkg.package_name,
    pkg.description
  ) IS DISTINCT FROM (
    u.package_name,
    u.description
  );

-- Relationship review note:
-- Existing public.catalog_package_items rows already express the 52 included
-- module relationships for the 23 active Yarbo packages reviewed on 2026-07-20.
-- This proposal does not add, delete, or update package-item rows.
-- This proposal does not add variant-option rows. Yarbo has no active variants
-- in the reviewed public API-equivalent output.
-- Package grouping is a future frontend presentation concern; no package group
-- column exists in the current public catalog schema.

ROLLBACK;
