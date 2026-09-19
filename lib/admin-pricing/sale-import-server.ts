import "server-only";

import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  getSupabaseServiceClient,
} from "@/lib/supabase";

import {
  assertSaleImportBrandMatches,
  matchSaleImportRows,
  parseSaleImportWorkbook,
  saleImportCandidateAllowedForScope,
  SaleImportParseError,
  suggestSaleImportCandidates,
  type SaleImportCandidate,
  type SaleImportPricingScope,
} from "@/lib/admin-pricing/sale-import-parser";


const IMPORT_BUCKET =
  "catalog-sale-imports-private";

const MAX_FILE_BYTES =
  4 * 1024 * 1024;

const EXTENSIONS = new Set([
  "xlsx",
  "xls",
  "csv",
]);


export class SaleImportError extends Error {
  status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "SaleImportError";
    this.status = status;
  }
}


type Candidate = SaleImportCandidate;


export type SaleImportPreviewRow = {
  id?: string;
  sheetName: string;
  rowNumber: number;
  itemName: string | null;
  sku: string | null;
  matchStatus:
    | "matched"
    | "needs_review"
    | "skipped";

  matchConfidence: number | null;
  matchedKind: Candidate["kind"] | null;
  matchedId: string | null;
  matchedLabel: string | null;

  proposedMsrpCents: number | null;
  proposedSaleCents: number | null;
  proposedDiscountCents: number | null;
  proposedDealerCostCents: number | null;
  proposedSaleStartsAt: string | null;
  proposedSaleEndsAt: string | null;
  proposedPromotionLabel: string | null;
  proposedSaleMessage: string | null;
  currentMsrpCents: number | null;
  currentSaleCents: number | null;
  targetStatus: string | null;
  matchMethod: string | null;
  matchReason: string | null;
  validationErrors: string[];
  suggestions: Array<{
    kind: Candidate["kind"];
    id: string;
    label: string;
  }>;
};


async function canonicalBrand(
  requestedBrand: string,
) {
  const client =
    getSupabaseServiceClient();

  const {
    data,
    error,
  } = await client
    .from("catalog_products")
    .select("brand");

  if (error) {
    throw error;
  }

  const brands =
    [
      ...new Set(
        (data ?? [])
          .map(
            (row) =>
              typeof row.brand ===
              "string"
                ? row.brand.trim()
                : "",
          )
          .filter(Boolean),
      ),
    ];

  const requested =
    requestedBrand
      .trim()
      .toLowerCase();

  const match =
    brands.find(
      (brand) =>
        brand.toLowerCase() ===
        requested,
    );

  if (!match) {
    throw new SaleImportError(
      400,
      "Choose a manufacturer that exists in the IDS catalog.",
    );
  }

  return match;
}


async function loadCandidates(
  brand: string,
): Promise<Candidate[]> {
  const client =
    getSupabaseServiceClient();

  const {
    data: productRows,
    error: productError,
  } = await client
    .from("catalog_products")
    .select(
      "id,name,slug,brand,display_msrp_price_cents,sale_price_cents,public_status",
    )
    .ilike(
      "brand",
      brand,
    );

  if (productError) {
    throw productError;
  }

  const products =
    productRows ?? [];

  const productIds =
    products.map(
      (row) =>
        String(row.id),
    );

  const productNameById =
    new Map(
      products.map(
        (row) => [
          String(row.id),
          String(
            row.name ?? "",
          ),
        ],
      ),
    );

  const productSlugById =
    new Map(
      products.map(
        (row) => [
          String(row.id),
          String(row.slug ?? ""),
        ],
      ),
    );

  const candidates:
    Candidate[] =
      products.map(
        (row) => ({
          kind: "product",
          id: String(row.id),
          productId:
            String(row.id),
          productSlug:
            String(row.slug ?? "") || null,
          brand:
            String(row.brand ?? brand),
          label:
            String(
              row.name ??
                "Unnamed product",
            ),

          aliases: [
            String(
              row.name ?? "",
            ),

            `${String(
              row.brand ?? brand,
            )} ${String(
              row.name ?? "",
            )}`,

            String(
              row.slug ?? "",
            ),
          ],
          slug:
            String(row.slug ?? "") || null,
          sku: null,
          componentSignature: [],
          y40PriceMode: null,
          currentDisplayMsrpCents:
            typeof row.display_msrp_price_cents === "number"
              ? row.display_msrp_price_cents
              : null,
          currentSaleCents:
            typeof row.sale_price_cents === "number"
              ? row.sale_price_cents
              : null,
          publicStatus:
            typeof row.public_status === "string" ? row.public_status : null,
        }),
      );

  if (!productIds.length) {
    return candidates;
  }

  const [
    variantsResult,
    optionsResult,
    packagesResult,
  ] = await Promise.all([
    client
      .from(
        "catalog_product_variants",
      )
      .select(
        "id,product_id,name,variant_slug,sku,display_msrp_price_cents,sale_price_cents,public_status",
      )
      .in(
        "product_id",
        productIds,
      ),

    client
      .from(
        "catalog_options",
      )
      .select(
        "id,product_id,name,option_slug,display_msrp_price_cents,sale_price_cents,public_status",
      )
      .in(
        "product_id",
        productIds,
      ),

    client
      .from(
        "catalog_packages",
      )
      .select(
        "id,product_id,package_name,package_slug,display_msrp_price_cents,sale_price_cents,public_status",
      )
      .in(
        "product_id",
        productIds,
      ),
  ]);

  if (
    variantsResult.error
  ) {
    throw variantsResult.error;
  }

  if (
    optionsResult.error
  ) {
    throw optionsResult.error;
  }

  if (
    packagesResult.error
  ) {
    throw packagesResult.error;
  }

  const packageIds =
    (packagesResult.data ?? []).map(
      (row) => String(row.id),
    );

  const [
    packageItemsResult,
    packageCorePricesResult,
  ] = packageIds.length
    ? await Promise.all([
        client
          .from("catalog_package_items")
          .select("package_id,option_id")
          .in("package_id", packageIds),
        client
          .from("catalog_package_core_prices")
          .select("package_id,core_variant_id,price_mode")
          .in("package_id", packageIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (packageItemsResult.error) throw packageItemsResult.error;
  if (packageCorePricesResult.error) throw packageCorePricesResult.error;

  const optionSlugById = new Map(
    (optionsResult.data ?? []).map((row) => [
      String(row.id),
      String(row.option_slug ?? ""),
    ]),
  );
  const packageComponents = new Map<string, string[]>();
  for (const item of packageItemsResult.data ?? []) {
    const packageId = String(item.package_id);
    const slug = optionSlugById.get(String(item.option_id));
    if (!slug) continue;
    const existing = packageComponents.get(packageId) ?? [];
    existing.push(slug);
    packageComponents.set(packageId, existing);
  }
  for (const [packageId, slugs] of packageComponents) {
    packageComponents.set(packageId, [...new Set(slugs)].sort());
  }

  const y40VariantId =
    (variantsResult.data ?? []).find(
      (row) => row.variant_slug === "yarbo-y40",
    )?.id;
  const y40PriceModeByPackage = new Map<string, "package" | "core_specific">();
  if (y40VariantId) {
    for (const row of packageCorePricesResult.data ?? []) {
      if (String(row.core_variant_id) !== String(y40VariantId)) continue;
      if (row.price_mode === "package" || row.price_mode === "core_specific") {
        y40PriceModeByPackage.set(String(row.package_id), row.price_mode);
      }
    }
  }

  for (
    const row
    of variantsResult.data ?? []
  ) {
    const productId =
      String(row.product_id);

    const name =
      String(row.name ?? "");

    candidates.push({
      kind: "variant",
      id: String(row.id),
      productId,
      productSlug:
        productSlugById.get(productId) ?? null,
      brand,
      label: name,

      aliases: [
        name,
        String(
          row.variant_slug ?? "",
        ),

        `${productNameById.get(
          productId,
        ) ?? ""} ${name}`,
      ],
      slug:
        String(row.variant_slug ?? "") || null,
      sku:
        typeof row.sku === "string" && row.sku.trim() ? row.sku.trim() : null,
      componentSignature: [],
      y40PriceMode: null,
      currentDisplayMsrpCents:
        typeof row.display_msrp_price_cents === "number"
          ? row.display_msrp_price_cents
          : null,
      currentSaleCents:
        typeof row.sale_price_cents === "number" ? row.sale_price_cents : null,
      publicStatus:
        typeof row.public_status === "string" ? row.public_status : null,
    });
  }

  for (
    const row
    of optionsResult.data ?? []
  ) {
    const productId =
      String(row.product_id);

    const name =
      String(row.name ?? "");

    candidates.push({
      kind: "option",
      id: String(row.id),
      productId,
      productSlug:
        productSlugById.get(productId) ?? null,
      brand,
      label: name,

      aliases: [
        name,
        String(
          row.option_slug ?? "",
        ),

        `${productNameById.get(
          productId,
        ) ?? ""} ${name}`,
      ],
      slug:
        String(row.option_slug ?? "") || null,
      sku: null,
      componentSignature: [],
      y40PriceMode: null,
      currentDisplayMsrpCents:
        typeof row.display_msrp_price_cents === "number"
          ? row.display_msrp_price_cents
          : null,
      currentSaleCents:
        typeof row.sale_price_cents === "number" ? row.sale_price_cents : null,
      publicStatus:
        typeof row.public_status === "string" ? row.public_status : null,
    });
  }

  for (
    const row
    of packagesResult.data ?? []
  ) {
    const productId =
      String(row.product_id);

    const name =
      String(
        row.package_name ?? "",
      );

    candidates.push({
      kind: "package",
      id: String(row.id),
      productId,
      productSlug:
        productSlugById.get(productId) ?? null,
      brand,
      label: name,

      aliases: [
        name,
        String(
          row.package_slug ?? "",
        ),

        `${productNameById.get(
          productId,
        ) ?? ""} ${name}`,
      ],
      slug:
        String(row.package_slug ?? "") || null,
      sku: null,
      componentSignature:
        packageComponents.get(String(row.id)) ?? [],
      y40PriceMode:
        y40PriceModeByPackage.get(String(row.id)) ?? null,
      currentDisplayMsrpCents:
        typeof row.display_msrp_price_cents === "number"
          ? row.display_msrp_price_cents
          : null,
      currentSaleCents:
        typeof row.sale_price_cents === "number" ? row.sale_price_cents : null,
      publicStatus:
        typeof row.public_status === "string" ? row.public_status : null,
    });
  }

  return candidates;
}


function targetColumns(
  candidate: Candidate,
) {
  return {
    product_id:
      candidate.kind ===
      "product"
        ? candidate.id
        : null,

    variant_id:
      candidate.kind ===
      "variant"
        ? candidate.id
        : null,

    option_id:
      candidate.kind ===
      "option"
        ? candidate.id
        : null,

    package_id:
      candidate.kind ===
      "package"
        ? candidate.id
        : null,
  };
}


export async function createSaleImportPreview(
  file: File,
  requestedBrand: string,
) {
  if (
    !(file instanceof File)
  ) {
    throw new SaleImportError(
      400,
      "Choose a price sheet to upload.",
    );
  }

  if (
    file.size <= 0
  ) {
    throw new SaleImportError(
      400,
      "The selected price sheet is empty.",
    );
  }

  if (
    file.size >
    MAX_FILE_BYTES
  ) {
    throw new SaleImportError(
      413,
      "Price sheets must be 4 MB or smaller.",
    );
  }

  if (
    file.name.length > 255
  ) {
    throw new SaleImportError(
      400,
      "The price sheet file name is too long.",
    );
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() ??
    "";

  if (
    !EXTENSIONS.has(
      extension,
    )
  ) {
    throw new SaleImportError(
      400,
      "Upload an XLSX, XLS, or CSV price sheet.",
    );
  }

  const buffer =
    Buffer.from(
      await file.arrayBuffer(),
    );

  let workbook;
  try {
    workbook = parseSaleImportWorkbook(
      buffer,
      file.name,
    );
  } catch (error) {
    if (error instanceof SaleImportParseError) {
      throw new SaleImportError(400, error.message);
    }
    throw error;
  }

  const brand =
    await canonicalBrand(
      requestedBrand,
    );

  try {
    assertSaleImportBrandMatches(
      workbook.detectedManufacturerBrand,
      brand,
    );
  } catch (error) {
    if (error instanceof SaleImportParseError) {
      throw new SaleImportError(400, error.message);
    }
    throw error;
  }

  const candidates =
    await loadCandidates(
      brand,
    );

  const prepared =
    matchSaleImportRows(
      workbook,
      candidates,
    );

  const safeMatchCount =
    prepared.filter(
      (item) =>
        item.matchStatus ===
        "matched",
    ).length;

  const needsReviewCount =
    prepared.filter(
      (item) =>
        item.matchStatus ===
        "needs_review",
    ).length;

  const hash =
    createHash("sha256")
      .update(buffer)
      .digest("hex");

  const client =
    getSupabaseServiceClient();

  const privateClient =
    client.schema(
      "catalog_private",
    );

  const {
    data: importRow,
    error: importError,
  } = await privateClient
    .from(
      "catalog_sale_imports",
    )
    .insert({
      manufacturer_brand:
        brand,

      original_file_name:
        file.name,

      file_sha256:
        hash,

      status: "preview",

      parsed_row_count:
        workbook.rows.length,

      safe_match_count:
        safeMatchCount,

      needs_review_count:
        needsReviewCount,

      applied_row_count: 0,

      detected_manufacturer_brand:
        workbook.detectedManufacturerBrand,

      pricing_scope:
        workbook.pricingScope,

      promotion_label:
        workbook.promotionLabel,

      promotion_starts_at:
        workbook.promotionStartsAt,

      promotion_ends_at:
        workbook.promotionEndsAt,

      header_sheet_name:
        workbook.sheetName,

      header_row_number:
        workbook.headerRowNumber,

      column_mapping:
        workbook.headerMapping,
    })
    .select("id")
    .single();

  if (
    importError ||
    !importRow
  ) {
    throw (
      importError ??
      new Error(
        "SALE_IMPORT_CREATE_FAILED",
      )
    );
  }

  const importId =
    String(importRow.id);

  const safeName =
    file.name
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "-",
      )
      .slice(0, 160);

  const storagePath =
    `sale-imports/${new Date()
      .toISOString()
      .slice(0, 10)}/${importId}-${randomUUID()}-${safeName}`;

  const contentType =
    extension === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : extension === "xls"
        ? "application/vnd.ms-excel"
        : "text/csv";

  const uploadResult =
    await client.storage
      .from(IMPORT_BUCKET)
      .upload(
        storagePath,
        buffer,
        {
          contentType,
          upsert: false,
        },
      );

  if (
    uploadResult.error
  ) {
    await privateClient
      .from(
        "catalog_sale_imports",
      )
      .update({
        status: "failed",
        failure_message:
          "Private price-sheet storage upload failed.",
      })
      .eq(
        "id",
        importId,
      );

    throw new SaleImportError(
      500,
      "The price sheet could not be stored securely.",
    );
  }

  const rowsToInsert =
    prepared.map(
      ({
        row,
        candidate,
        matchStatus,
        matchConfidence,
        matchMethod,
        matchReason,
      }) => ({
        import_id:
          importId,

        sheet_name:
          row.sheetName,

        source_row_number:
          row.rowNumber,

        manufacturer_item_name:
          row.itemName,

        manufacturer_sku:
          row.sku,

        raw_row:
          row.raw,

        ...(
          candidate
            ? targetColumns(
                candidate,
              )
            : {
                product_id:
                  null,
                variant_id:
                  null,
                option_id:
                  null,
                package_id:
                  null,
              }
        ),

        match_status:
          matchStatus,

        match_confidence:
          matchConfidence,

        match_method:
          matchMethod,

        match_reason:
          matchReason,

        validation_errors:
          row.validationErrors,

        approved: false,

        proposed_display_msrp_price_cents:
          row.msrpCents,

        proposed_sale_price_cents:
          row.saleCents,

        proposed_discount_cents:
          row.discountCents,

        proposed_sale_starts_at:
          row.startsAt,

        proposed_sale_ends_at:
          row.endsAt,

        proposed_promotional_dealer_cost_cents:
          row.dealerCostCents,

        proposed_promotion_label:
          row.promotionLabel,

        proposed_sale_message:
          row.saleMessage,

        proposed_show_sale_message_public:
          false,
      }),
    );

  const {
    data: insertedRows,
    error: rowsError,
  } = await privateClient
    .from(
      "catalog_sale_import_rows",
    )
    .insert(rowsToInsert)
    .select("id");

  if (rowsError) {
    const cleanupResult =
      await client.storage
        .from(IMPORT_BUCKET)
        .remove([storagePath]);

    await privateClient
      .from(
        "catalog_sale_imports",
      )
      .update({
        status: "failed",
        storage_path:
          cleanupResult.error
            ? storagePath
            : null,

        failure_message:
          "Parsed spreadsheet rows could not be saved.",
      })
      .eq(
        "id",
        importId,
      );

    throw rowsError;
  }

  const {
    error: readyError,
  } = await privateClient
    .from(
      "catalog_sale_imports",
    )
    .update({
      storage_path:
        storagePath,

      status: "ready",
    })
    .eq(
      "id",
      importId,
    );

  if (readyError) {
    throw readyError;
  }

  const rowIds =
    (
      insertedRows ?? []
    ).map(
      (row) =>
        String(row.id),
    );

  const preview:
    SaleImportPreviewRow[] =
      prepared
        .slice(0, 250)
        .map(
          (
            {
              row,
              candidate,
              matchStatus,
              matchConfidence,
              matchMethod,
              matchReason,
              suggestions,
            },
            index,
          ) => ({
            id:
              rowIds[index],

            sheetName:
              row.sheetName,

            rowNumber:
              row.rowNumber,

            itemName:
              row.itemName,

            sku:
              row.sku,

            matchStatus,

            matchConfidence:
              matchConfidence,

            matchedKind:
              candidate?.kind ??
              null,

            matchedId:
              candidate?.id ??
              null,

            matchedLabel:
              candidate?.label ??
              null,

            proposedMsrpCents:
              row.msrpCents,

            proposedSaleCents:
              row.saleCents,

            proposedDiscountCents:
              row.discountCents,

            proposedDealerCostCents:
              row.dealerCostCents,

            proposedSaleStartsAt:
              row.startsAt,

            proposedSaleEndsAt:
              row.endsAt,

            proposedPromotionLabel:
              row.promotionLabel,

            proposedSaleMessage:
              row.saleMessage,

            currentMsrpCents:
              candidate?.currentDisplayMsrpCents ?? null,

            currentSaleCents:
              candidate?.currentSaleCents ?? null,

            targetStatus:
              candidate?.publicStatus ?? null,

            matchMethod,

            matchReason,

            validationErrors:
              row.validationErrors,

            suggestions:
              suggestions.map((item) => ({
                kind: item.kind,
                id: item.id,
                label: item.label,
              })),
          }),
        );

  return {
    importId,
    manufacturerBrand:
      brand,

    originalFileName:
      file.name,

    parsedRowCount:
      workbook.rows.length,

    safeMatchCount,

    needsReviewCount,

    skippedCount:
      prepared.filter(
        (item) =>
          item.matchStatus ===
          "skipped",
      ).length,

    previewLimited:
      prepared.length > 250,

    detectedManufacturerBrand:
      workbook.detectedManufacturerBrand,

    pricingScope:
      workbook.pricingScope,

    promotionLabel:
      workbook.promotionLabel,

    promotionStartsAt:
      workbook.promotionStartsAt,

    promotionEndsAt:
      workbook.promotionEndsAt,

    headerSheetName:
      workbook.sheetName,

    headerRowNumber:
      workbook.headerRowNumber,

    columnMapping:
      workbook.headerMapping,

    rows:
      preview,
  };
}


export async function readSaleImportAdminData() {
  const client =
    getSupabaseServiceClient();

  const {
    data: productRows,
    error: productError,
  } = await client
    .from("catalog_products")
    .select("brand");

  if (productError) {
    throw productError;
  }

  const brands =
    [
      ...new Set(
        (productRows ?? [])
          .map(
            (row) =>
              typeof row.brand ===
              "string"
                ? row.brand.trim()
                : "",
          )
          .filter(Boolean),
      ),
    ].sort(
      (a, b) =>
        a.localeCompare(b),
    );

  const {
    data: imports,
    error: importsError,
  } = await client
    .schema(
      "catalog_private",
    )
    .from(
      "catalog_sale_imports",
    )
    .select(
      "id,manufacturer_brand,original_file_name,status,parsed_row_count,safe_match_count,needs_review_count,applied_row_count,failure_message,created_at,applied_at,detected_manufacturer_brand,pricing_scope,promotion_label,promotion_starts_at,promotion_ends_at,header_sheet_name,header_row_number,column_mapping",
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    )
    .limit(50);

  if (importsError) {
    throw importsError;
  }

  return {
    brands,
    imports:
      imports ?? [],
  };
}


export type SaleImportReviewCandidate = {
  kind: Candidate["kind"];
  id: string;
  label: string;
  slug: string | null;
  productSlug: string | null;
  y40PriceMode: "package" | "core_specific" | null;
  currentMsrpCents: number | null;
  currentSaleCents: number | null;
  publicStatus: string | null;
};

export type SaleImportReviewRow = {
  id: string;
  sheetName: string | null;
  rowNumber: number | null;
  itemName: string | null;
  sku: string | null;
  matchStatus:
    | "matched"
    | "needs_review"
    | "skipped"
    | "applied";
  approved: boolean;
  matchConfidence: number | null;
  matchedKind: Candidate["kind"] | null;
  matchedId: string | null;
  matchedLabel: string | null;
  proposedMsrpCents: number | null;
  proposedSaleCents: number | null;
  proposedDiscountCents: number | null;
  proposedDealerCostCents: number | null;
  proposedSaleStartsAt: string | null;
  proposedSaleEndsAt: string | null;
  proposedPromotionLabel: string | null;
  proposedSaleMessage: string | null;
  currentMsrpCents: number | null;
  currentSaleCents: number | null;
  targetStatus: string | null;
  matchMethod: string | null;
  matchReason: string | null;
  validationErrors: string[];
  suggestions: SaleImportReviewCandidate[];
  appliedAt: string | null;
};

function assertUuid(
  value: string,
  label: string,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new SaleImportError(
      400,
      `${label} is invalid.`,
    );
  }
}

function candidateFromStoredRow(
  row: Record<string, unknown>,
  candidates: Candidate[],
): Candidate | null {
  const mappings = [
    ["product_id", "product"],
    ["variant_id", "variant"],
    ["option_id", "option"],
    ["package_id", "package"],
  ] as const;

  for (const [column, kind] of mappings) {
    const id = row[column];

    if (!id) {
      continue;
    }

    return (
      candidates.find(
        candidate =>
          candidate.kind === kind &&
          candidate.id === String(id),
      ) ?? null
    );
  }

  return null;
}

export async function readSaleImportReview(
  importId: string,
) {
  assertUuid(
    importId,
    "Import ID",
  );

  const client =
    getSupabaseServiceClient();

  const privateClient =
    client.schema(
      "catalog_private",
    );

  const {
    data: importRow,
    error: importError,
  } = await privateClient
    .from(
      "catalog_sale_imports",
    )
    .select(
      "id,manufacturer_brand,original_file_name,status,parsed_row_count,safe_match_count,needs_review_count,applied_row_count,failure_message,created_at,applied_at,detected_manufacturer_brand,pricing_scope,promotion_label,promotion_starts_at,promotion_ends_at,header_sheet_name,header_row_number,column_mapping",
    )
    .eq(
      "id",
      importId,
    )
    .maybeSingle();

  if (importError) {
    throw importError;
  }

  if (!importRow) {
    throw new SaleImportError(
      404,
      "Price-sheet import not found.",
    );
  }

  const brand =
    String(
      importRow.manufacturer_brand,
    );

  const candidates =
    await loadCandidates(
      brand,
    );

  const pricingScope: SaleImportPricingScope =
    importRow.pricing_scope === "y40" || importRow.pricing_scope === "y40p"
      ? importRow.pricing_scope
      : "generic";

  const reviewCandidates =
    candidates.filter((candidate) =>
      saleImportCandidateAllowedForScope(candidate, pricingScope),
    );

  const {
    data: rows,
    error: rowsError,
  } = await privateClient
    .from(
      "catalog_sale_import_rows",
    )
    .select(
      "id,sheet_name,source_row_number,manufacturer_item_name,manufacturer_sku,product_id,variant_id,option_id,package_id,match_status,match_confidence,match_method,match_reason,validation_errors,approved,proposed_display_msrp_price_cents,proposed_sale_price_cents,proposed_discount_cents,proposed_sale_starts_at,proposed_sale_ends_at,proposed_promotional_dealer_cost_cents,proposed_promotion_label,proposed_sale_message,applied_at",
    )
    .eq(
      "import_id",
      importId,
    )
    .order(
      "source_row_number",
      {
        ascending: true,
      },
    );

  if (rowsError) {
    throw rowsError;
  }

  const reviewRows:
    SaleImportReviewRow[] =
      (
        (rows ?? []) as Record<
          string,
          unknown
        >[]
      ).map(row => {
        const candidate =
          candidateFromStoredRow(
            row,
            reviewCandidates,
          );

        const rawStatus =
          String(
            row.match_status ??
              "needs_review",
          );

        const matchStatus:
          SaleImportReviewRow["matchStatus"] =
            rawStatus === "matched" ||
            rawStatus === "skipped" ||
            rawStatus === "applied"
              ? rawStatus
              : "needs_review";

        const itemName =
          typeof row.manufacturer_item_name === "string"
            ? row.manufacturer_item_name
            : null;

        const validationErrors =
          Array.isArray(row.validation_errors)
            ? row.validation_errors.filter(
                (value): value is string => typeof value === "string",
              )
            : [];

        const suggestions =
          matchStatus === "needs_review"
            ? suggestSaleImportCandidates(
                {
                  itemName,
                  baseItemName:
                    itemName?.normalize("NFKC").split("(", 1)[0].trim() || null,
                },
                reviewCandidates,
                pricingScope,
              ).map((item) => ({
                kind: item.kind,
                id: item.id,
                label: item.label,
                slug: item.slug,
                productSlug: item.productSlug,
                y40PriceMode: item.y40PriceMode,
                currentMsrpCents: item.currentDisplayMsrpCents,
                currentSaleCents: item.currentSaleCents,
                publicStatus: item.publicStatus,
              }))
            : [];

        return {
          id:
            String(row.id),

          sheetName:
            typeof row.sheet_name ===
            "string"
              ? row.sheet_name
              : null,

          rowNumber:
            typeof row.source_row_number ===
            "number"
              ? row.source_row_number
              : null,

          itemName,

          sku:
            typeof row.manufacturer_sku ===
            "string"
              ? row.manufacturer_sku
              : null,

          matchStatus,

          approved:
            row.approved === true,

          matchConfidence:
            typeof row.match_confidence ===
            "number"
              ? row.match_confidence
              : null,

          matchedKind:
            candidate?.kind ??
            null,

          matchedId:
            candidate?.id ??
            null,

          matchedLabel:
            candidate?.label ??
            null,

          proposedMsrpCents:
            typeof row.proposed_display_msrp_price_cents ===
            "number"
              ? row.proposed_display_msrp_price_cents
              : null,

          proposedSaleCents:
            typeof row.proposed_sale_price_cents ===
            "number"
              ? row.proposed_sale_price_cents
              : null,

          proposedDiscountCents:
            typeof row.proposed_discount_cents === "number"
              ? row.proposed_discount_cents
              : null,

          proposedDealerCostCents:
            typeof row.proposed_promotional_dealer_cost_cents ===
            "number"
              ? row.proposed_promotional_dealer_cost_cents
              : null,

          proposedSaleStartsAt:
            typeof row.proposed_sale_starts_at ===
            "string"
              ? row.proposed_sale_starts_at
              : null,

          proposedSaleEndsAt:
            typeof row.proposed_sale_ends_at ===
            "string"
              ? row.proposed_sale_ends_at
              : null,

          proposedPromotionLabel:
            typeof row.proposed_promotion_label === "string"
              ? row.proposed_promotion_label
              : null,

          proposedSaleMessage:
            typeof row.proposed_sale_message ===
            "string"
              ? row.proposed_sale_message
              : null,

          currentMsrpCents:
            candidate?.currentDisplayMsrpCents ?? null,

          currentSaleCents:
            candidate?.currentSaleCents ?? null,

          targetStatus:
            candidate?.publicStatus ?? null,

          matchMethod:
            typeof row.match_method === "string" ? row.match_method : null,

          matchReason:
            typeof row.match_reason === "string" ? row.match_reason : null,

          validationErrors,

          suggestions,

          appliedAt:
            typeof row.applied_at ===
            "string"
              ? row.applied_at
              : null,
        };
      });

  return {
    import: importRow,

    candidates:
      reviewCandidates
        .map(
          candidate => ({
            kind:
              candidate.kind,

            id:
              candidate.id,

            label:
              candidate.label,

            slug:
              candidate.slug,

            productSlug:
              candidate.productSlug,

            y40PriceMode:
              candidate.y40PriceMode,

            currentMsrpCents:
              candidate.currentDisplayMsrpCents,

            currentSaleCents:
              candidate.currentSaleCents,

            publicStatus:
              candidate.publicStatus,
          }),
        )
        .sort(
          (a, b) =>
            a.label.localeCompare(
              b.label,
            ),
        ),

    rows:
      reviewRows,
  };
}


export async function updateSaleImportRowReview(
  importId: string,
  rowId: string,
  input: {
    approved?: boolean;
    targetKind?:
      | Candidate["kind"]
      | null;
    targetId?:
      | string
      | null;
  },
) {
  assertUuid(
    importId,
    "Import ID",
  );

  assertUuid(
    rowId,
    "Import row ID",
  );

  if (
    typeof input !==
      "object" ||
    input === null
  ) {
    throw new SaleImportError(
      400,
      "Invalid review update.",
    );
  }

  const client =
    getSupabaseServiceClient();

  const privateClient =
    client.schema(
      "catalog_private",
    );

  const {
    data: importRow,
    error: importError,
  } = await privateClient
    .from(
      "catalog_sale_imports",
    )
    .select(
      "id,manufacturer_brand,status,pricing_scope",
    )
    .eq(
      "id",
      importId,
    )
    .maybeSingle();

  if (importError) {
    throw importError;
  }

  if (!importRow) {
    throw new SaleImportError(
      404,
      "Price-sheet import not found.",
    );
  }

  if (
    importRow.status ===
    "applied"
  ) {
    throw new SaleImportError(
      409,
      "This price-sheet import has already been applied.",
    );
  }

  const {
    data: existingRow,
    error: existingError,
  } = await privateClient
    .from(
      "catalog_sale_import_rows",
    )
    .select(
      "id,match_status,approved,product_id,variant_id,option_id,package_id,validation_errors",
    )
    .eq(
      "id",
      rowId,
    )
    .eq(
      "import_id",
      importId,
    )
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (!existingRow) {
    throw new SaleImportError(
      404,
      "Price-sheet row not found.",
    );
  }

  if (
    existingRow.match_status ===
    "applied"
  ) {
    throw new SaleImportError(
      409,
      "An applied row cannot be changed.",
    );
  }

  const update:
    Record<string, unknown> = {};

  const targetWasSupplied =
    Object.prototype.hasOwnProperty.call(
      input,
      "targetKind",
    ) ||
    Object.prototype.hasOwnProperty.call(
      input,
      "targetId",
    );

  if (targetWasSupplied) {
    const targetKind =
      input.targetKind ??
      null;

    const targetId =
      input.targetId ??
      null;

    if (
      targetKind === null ||
      targetId === null
    ) {
      Object.assign(
        update,
        {
          product_id: null,
          variant_id: null,
          option_id: null,
          package_id: null,
          match_status:
            "needs_review",
          match_confidence: null,
          match_method: null,
          match_reason:
            "No IDS catalog target is selected.",
          approved: false,
        },
      );
    } else {
      if (
        ![
          "product",
          "variant",
          "option",
          "package",
        ].includes(
          targetKind,
        )
      ) {
        throw new SaleImportError(
          400,
          "Invalid IDS match type.",
        );
      }

      assertUuid(
        targetId,
        "IDS match ID",
      );

      const candidates =
        await loadCandidates(
          String(
            importRow.manufacturer_brand,
          ),
        );

      const pricingScope: SaleImportPricingScope =
        importRow.pricing_scope === "y40" || importRow.pricing_scope === "y40p"
          ? importRow.pricing_scope
          : "generic";

      const candidate =
        candidates.find(
          item =>
            item.kind ===
              targetKind &&
            item.id ===
              targetId &&
            saleImportCandidateAllowedForScope(item, pricingScope),
        );

      if (!candidate) {
        throw new SaleImportError(
          400,
          "The selected IDS item does not belong to this manufacturer.",
        );
      }

      Object.assign(
        update,
        {
          ...targetColumns(
            candidate,
          ),

          match_status:
            Array.isArray(existingRow.validation_errors) && existingRow.validation_errors.length
              ? "needs_review"
              : "matched",

          match_confidence:
            null,

          match_method:
            "manual",

          match_reason:
            "IDS administrator selected this catalog target.",

          approved: false,
        },
      );
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input,
      "approved",
    )
  ) {
    if (
      typeof input.approved !==
      "boolean"
    ) {
      throw new SaleImportError(
        400,
        "Approved must be true or false.",
      );
    }

    if (
      input.approved
    ) {
      if (
        Array.isArray(existingRow.validation_errors) &&
        existingRow.validation_errors.length > 0
      ) {
        throw new SaleImportError(
          400,
          "Resolve the source validation errors before approving this row.",
        );
      }

      const hasStoredTarget =
        Boolean(
          update.product_id ??
          update.variant_id ??
          update.option_id ??
          update.package_id ??
          existingRow.product_id ??
          existingRow.variant_id ??
          existingRow.option_id ??
          existingRow.package_id,
        );

      const resultingStatus =
        String(
          update.match_status ??
          existingRow.match_status,
        );

      if (
        !hasStoredTarget ||
        resultingStatus !==
          "matched"
      ) {
        throw new SaleImportError(
          400,
          "Choose a valid IDS match before approving this row.",
        );
      }
    }

    update.approved =
      input.approved;
  }

  update.updated_at =
    new Date().toISOString();

  const {
    error: updateError,
  } = await privateClient
    .from(
      "catalog_sale_import_rows",
    )
    .update(update)
    .eq(
      "id",
      rowId,
    )
    .eq(
      "import_id",
      importId,
    );

  if (updateError) {
    throw updateError;
  }

  const review =
    await readSaleImportReview(
      importId,
    );

  const row =
    review.rows.find(
      item =>
        item.id === rowId,
    );

  if (!row) {
    throw new Error(
      "Updated import row could not be reloaded.",
    );
  }

  return row;
}
