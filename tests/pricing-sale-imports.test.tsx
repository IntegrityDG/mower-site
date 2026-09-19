import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(path, "utf8");

const uploadRoute = read(
  "app/api/admin/pricing/sale-imports/route.ts",
);

const reviewRoute = read(
  "app/api/admin/pricing/sale-imports/[id]/route.ts",
);

const rowRoute = read(
  "app/api/admin/pricing/sale-imports/[id]/rows/[rowId]/route.ts",
);

const applyRoute = read(
  "app/api/admin/pricing/sale-imports/[id]/apply/route.ts",
);

const importServer = read(
  "lib/admin-pricing/sale-import-server.ts",
);

const applyServer = read(
  "lib/admin-pricing/sale-import-apply-server.ts",
);

const applyPolicy = read(
  "lib/admin-pricing/sale-import-apply-policy.ts",
);

const parser = read(
  "lib/admin-pricing/sale-import-parser.ts",
);

const hardeningMigration = read(
  "supabase/migrations/20260918222638_harden_price_sheet_importer.sql",
);

const pricingPage = read(
  "app/admin/pricing/page.tsx",
);


test(
  "price-sheet routes require existing IDS admin authentication",
  () => {
    for (const source of [
      uploadRoute,
      reviewRoute,
      rowRoute,
      applyRoute,
    ]) {
      assert.match(
        source,
        /isReviewAdmin/,
      );

      assert.match(
        source,
        /status:\s*401/,
      );
    }
  },
);


test(
  "price-sheet upload accepts only supported spreadsheet extensions and remains preview-first",
  () => {
    assert.match(
      importServer,
      /"xlsx"/,
    );

    assert.match(
      importServer,
      /"xls"/,
    );

    assert.match(
      importServer,
      /"csv"/,
    );

    assert.match(
      importServer,
      /status:\s*"preview"/,
    );

    assert.match(
      importServer,
      /status:\s*"ready"/,
    );

    assert.match(
      pricingPage,
      /Upload & Preview/,
    );

    assert.match(
      pricingPage,
      /Preview Only — No Live Changes/,
    );
  },
);


test(
  "price-sheet matching is reviewable and approval does not itself apply pricing",
  () => {
    assert.match(
      importServer,
      /updateSaleImportRowReview/,
    );

    assert.match(
      importServer,
      /approved:\s*false/,
    );

    assert.match(
      pricingPage,
      /Approval Does Not Apply Prices/,
    );

    assert.match(
      pricingPage,
      /Needs manual match/,
    );
  },
);


test(
  "spreadsheet apply can never overwrite IDS Everyday Low Price",
  () => {
    assert.doesNotMatch(
      applyPolicy,
      /update\.regular_price_cents/,
    );

    assert.match(
      applyPolicy,
      /regular_price_cents:\s*input\.currentPricing\.regular_price_cents/,
    );

    assert.match(
      applyServer,
      /display_msrp_price_cents/,
    );

    assert.match(
      applyServer,
      /sale_price_cents/,
    );

    assert.match(
      pricingPage,
      /IDS Everyday Low Price is protected and will not be overwritten/,
    );
  },
);


test(
  "only approved matched rows can reach the apply path",
  () => {
    assert.match(
      applyServer,
      /row\.approved\s*&&\s*row\.matchStatus\s*===\s*"matched"/,
    );

    assert.match(
      applyServer,
      /Approve at least one matched row before applying pricing/,
    );

    assert.match(
      pricingPage,
      /Only rows marked Approved will be applied/,
    );
  },
);


test(
  "semantic parsing fails closed and fuzzy matches remain suggestions only",
  () => {
    assert.match(parser, /MAX_HEADER_NONEMPTY_ROWS = 20/);
    assert.match(parser, /AMBIGUOUS_HEADER/);
    assert.match(parser, /suggestSaleImportCandidates/);
    assert.match(parser, /No deterministic IDS catalog match was found/);
    assert.match(parser, /assertSaleImportBrandMatches/);
    assert.match(parser, /America\/Chicago/);
    assert.doesNotMatch(importServer, /sheet_to_json/);
  },
);


test(
  "structural and manufacturer validation happens before import or storage persistence",
  () => {
    const parseAt = importServer.indexOf("parseSaleImportWorkbook(");
    const brandCheckAt = importServer.indexOf("assertSaleImportBrandMatches(");
    const importInsertAt = importServer.search(/\.from\(\s*"catalog_sale_imports"/);
    const storageUploadAt = importServer.indexOf(".upload(");
    assert.ok(parseAt >= 0);
    assert.ok(brandCheckAt > parseAt);
    assert.ok(importInsertAt > brandCheckAt);
    assert.ok(storageUploadAt > importInsertAt);
  },
);


test(
  "Y40 and Y40P targets are constrained to their authoritative pricing sources",
  () => {
    assert.match(applyPolicy, /authoritative Y40 pricing source/);
    assert.match(applyPolicy, /candidate\.kind !== "variant"/);
    assert.match(applyPolicy, /candidate\.slug === "yarbo-y40p"/);
    assert.match(applyPolicy, /candidate\.y40PriceMode !== "package"/);
  },
);


test(
  "hardening migration changes only importer metadata and missing Y40 inheritance",
  () => {
    assert.match(hardeningMigration, /alter table catalog_private\.catalog_sale_imports/);
    assert.match(hardeningMigration, /alter table catalog_private\.catalog_sale_import_rows/);
    assert.match(hardeningMigration, /insert into public\.catalog_package_core_prices/);
    assert.match(hardeningMigration, /price_mode,\s*regular_price_cents/);
    assert.match(hardeningMigration, /'package',\s*null,\s*null/);
    assert.doesNotMatch(hardeningMigration, /update\s+public\.catalog_/i);
    assert.doesNotMatch(hardeningMigration, /yarbo-y40p/);
    assert.doesNotMatch(hardeningMigration, /payment_method/i);
  },
);


test(
  "review UI exposes parser evidence, current-to-proposed prices, and private costs",
  () => {
    assert.match(pricingPage, /Detected Source/);
    assert.match(pricingPage, /Header Evidence/);
    assert.match(pricingPage, /Current → Proposed MSRP/);
    assert.match(pricingPage, /exclusive end/);
    assert.match(pricingPage, /🔒 Promo Dealer Cost/);
    assert.match(pricingPage, /Suggestions only/);
  },
);


test(
  "promotional dealer cost remains temporary and requires an end date",
  () => {
    assert.match(
      applyServer,
      /catalog_promotional_dealer_costs/,
    );

    assert.match(
      applyPolicy,
      /Promotional dealer cost requires a promotion end date/,
    );

    assert.match(
      applyServer,
      /source_import_row_id/,
    );

    assert.doesNotMatch(
      applyServer,
      /catalog_internal_pricing/,
    );

    assert.match(
      read("supabase/migrations/20260818023107_add_pricing_promotion_content_and_sale_imports.sql"),
      /unique index catalog_promotional_costs_import_row_unique/,
    );
  },
);


test(
  "apply records before and applied values for audit and retry safety",
  () => {
    assert.match(
      applyServer,
      /before_values/,
    );

    assert.match(
      applyServer,
      /applied_values/,
    );

    assert.match(
      applyServer,
      /partially_applied/,
    );

    assert.match(
      applyServer,
      /match_status:\s*"applied"/,
    );
  },
);
