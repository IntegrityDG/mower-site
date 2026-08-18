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
      applyServer,
      /regular_price_cents/,
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
      /IDS Everyday Low Price will NOT be changed/,
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
  "promotional dealer cost remains temporary and requires an end date",
  () => {
    assert.match(
      applyServer,
      /catalog_promotional_dealer_costs/,
    );

    assert.match(
      applyServer,
      /Promotional dealer cost requires a promotion end date/,
    );

    assert.match(
      applyServer,
      /source_import_row_id/,
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
