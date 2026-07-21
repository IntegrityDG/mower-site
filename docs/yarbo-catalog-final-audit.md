# Yarbo Catalog Final Audit

Review date: 2026-07-20
Phase: review only

This final audit records the IDS-approved merchandising direction for Yarbo before any implementation. It replaces the earlier guided-configuration recommendation with two catalog sections: Complete Yarbo Packages and Individual Yarbo Equipment.

Implementation update: the approved two-section Yarbo frontend merchandising and purchase structure has now been implemented locally. SQL remains review-only and unexecuted, Supabase was not modified, pricing was not changed, and package-item relationships were not changed.

## Final Decision Summary

- All 23 valid Yarbo package records may remain active and customer-visible.
- Packages should be grouped, not shown as one unorganized list.
- Individual Yarbo equipment should be shown separately.
- Module-only items must prominently state: Module only — requires a Yarbo Core to operate.
- Do not add automatic package matching.
- Do not require customers to identify as new owners or existing owners.
- Do not expose Snow Plow Blade or Tow Hitch until IDS separately approves them.
- Do not expose included Core charging, battery, power, cable, mounting, RTK, or navigation equipment as optional selections.

## Package Groups

| Group | Count | Packages |
| --- | ---: | --- |
| Mowing Systems | 4 | `yarbo-lawn-mower`, `yarbo-lawn-mower-trimmer`, `yarbo-lawn-leaf`, `yarbo-lawn-leaf-trimmer` |
| Mower Pro Systems | 4 | `yarbo-lawn-mower-pro`, `yarbo-lawn-mower-pro-trimmer`, `yarbo-pro-leaf`, `yarbo-pro-leaf-trimmer` |
| Snow Systems | 4 | `yarbo-snow-blower`, `yarbo-snow-blower-trimmer`, `yarbo-snow-leaf`, `yarbo-snow-leaf-trimmer` |
| Cleanup And Trimming Systems | 3 | `yarbo-leaf-blower`, `yarbo-trimmer`, `yarbo-leaf-blower-trimmer` |
| Multi-Season Systems | 6 | `yarbo-snow-lawn`, `yarbo-snow-lawn-trimmer`, `yarbo-pro-snow`, `yarbo-pro-snow-trimmer`, `yarbo-lawn-snow-leaf`, `yarbo-pro-snow-leaf` |
| Full Property-Care Systems | 2 | `yarbo-lawn-snow-leaf-trimmer`, `yarbo-pro-snow-leaf-trimmer` |

Total grouped packages: 23.

## Package Naming Recommendations

- Use "System" for every complete package.
- Use "Standard Lawn Mower Module" or "standard Lawn Mower Module" when a package includes `yarbo-mower-module`.
- Use "Lawn Mower Pro Module" when a package includes `yarbo-lawn-mower-pro-module`.
- Replace "Leaf Blower" wording with "Blower" or "Blower Module".
- Keep stable database slugs.

## Package Validation

- Packages reviewed: 23.
- Package-item relationships reviewed: 52.
- Packages with zero customer-facing Cores: 0.
- Packages with multiple customer-facing Cores: 0.
- Packages with explicit Core option rows: 0, expected because Core is represented by product `yarbo`.
- Packages with duplicate module rows: 0.
- Exact duplicate package module sets: 0.
- Packages with misleading names: all packages using "Leaf Blower" wording need customer-facing rename to "Blower"; all package names should include "System" for clarity.
- Pricing and savings: not changed. Current price and savings display must come from existing catalog pricing fields.

## Individual Equipment To Remain Visible

| Record | Customer-facing name | Visibility |
| --- | --- | --- |
| `yarbo` | Yarbo Core | Visible |
| `yarbo-mower-module` | Standard Lawn Mower Module | Visible |
| `yarbo-lawn-mower-pro-module` | Lawn Mower Pro Module | Visible |
| `yarbo-snow-blower-module` | Snow Blower Module | Visible |
| `yarbo-leaf-blower-module` | Blower Module | Visible |
| `yarbo-trimmer-module` | Yarbo Trimmer Package | Visible |

Every module-only item should show the Core-required warning on the card, detail content, quantity/order line, and request summary.

## Hidden Equipment

Keep hidden:

- `yarbo-plow-module` / Snow Plow Blade
- `yarbo-tow-hitch` / Tow Hitch
- unapproved replacement equipment
- unapproved accessories
- included Core charging, battery, power, cable, mounting, RTK, and navigation equipment as optional add-ons

## Proposed Database Changes

The review-only SQL proposal would affect only:

- `public.catalog_products`: Yarbo Core customer-facing copy.
- `public.catalog_product_pages`: Yarbo page SEO, hero, and long-form page copy.
- `public.catalog_product_page_sections`: Yarbo page sections for platform introduction, complete packages, grouped package presentation, individual equipment, Core-required notice, included equipment, warranty/ownership, and CTA.
- `public.catalog_option_groups`: group name/description for individual Yarbo equipment.
- `public.catalog_options`: Yarbo option customer-facing names, descriptions, visibility, and max-one quantity rules.
- `public.catalog_packages`: Yarbo package names/descriptions only.

The SQL does not propose pricing, promotion, service, service-area, media, package-item, variant-option, private monitoring, RLS, grant, permission, Lymow, Pandag, or unrelated product changes.

## Frontend Presentation Implementation

- Complete Yarbo Systems now render as grouped sections/category navigation using frontend inference from stable package slugs, package names, and package-item module relationships.
- Individual Yarbo Equipment now renders as a separate path for Yarbo Core and the five approved active module records.
- Complete-system pricing uses the selected package current price only. Core and package-item module prices are not added separately.
- Individual-equipment pricing uses visible line items only: Yarbo Core product price when selected, plus selected module option prices.
- Package savings claims remain disabled. The frontend does not calculate or display "Save" amounts because IDS has not approved package-price comparison rules and active standalone module sale prices can conflict with package comparisons.
- Package cards show Yarbo Core included, Core charging equipment included, Core navigation/RTK equipment included, included modules, mower distinction, best-fit guidance, package description, and current package price.
- Module cards and module summary lines show: Module only — requires a Yarbo Core to operate.
- When modules are selected without Core, the purchase flow and summary show: Yarbo Core is not included. These modules require an existing Yarbo Core to operate.
- Yarbo module quantities are clamped to one in frontend state. Duplicate lines for the same module are prevented by the option-quantity map and toggle UI.
- Snow Plow Blade and Tow Hitch remain hidden because the active public catalog API does not return hidden option records.
- The Yarbo frontend does not use a guided module configurator, automatic package matching, a new-owner/existing-owner choice, or package conversion for manual selections.

## Remaining IDS Approval Items

- Final labels for the six package groups.
- Final package price confirmation that all 23 packages are priced as complete systems including one Core, included modules, Core charging equipment, and Core navigation/RTK equipment.
- Final package savings display rules; savings claims remain disabled until approved.
- Dealer-specific warranty handling.
- Whether Snow Plow Blade, Tow Hitch, or replacement equipment should become public later.
- Any official compatibility restriction that would require blocking Standard Lawn Mower Module and Lawn Mower Pro Module from being purchased together.

## Review-Only Confirmation

- SQL executed: no.
- Supabase modified: no.
- Frontend implementation completed locally: yes.
