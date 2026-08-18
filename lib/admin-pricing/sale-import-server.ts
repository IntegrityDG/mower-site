import "server-only";

import {
  createHash,
  randomUUID,
} from "node:crypto";

import * as XLSX from "xlsx";

import {
  getSupabaseServiceClient,
} from "@/lib/supabase";


const IMPORT_BUCKET =
  "catalog-sale-imports-private";

const MAX_FILE_BYTES =
  4 * 1024 * 1024;

const MAX_ROWS = 2000;

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


type ParsedSourceRow = {
  sheetName: string;
  rowNumber: number;
  raw: Record<string, unknown>;
  itemName: string | null;
  sku: string | null;
  msrpCents: number | null;
  saleCents: number | null;
  dealerCostCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  saleMessage: string | null;
};


type Candidate = {
  kind:
    | "product"
    | "variant"
    | "option"
    | "package";

  id: string;
  productId: string | null;
  label: string;
  aliases: string[];
};


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
  proposedDealerCostCents: number | null;
  proposedSaleStartsAt: string | null;
  proposedSaleEndsAt: string | null;
  proposedSaleMessage: string | null;
};


function normalizeHeader(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


function normalizeToken(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}


function textValue(
  value: unknown,
  max = 250,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  return text.slice(0, max);
}


function valueFromAliases(
  row: Record<string, unknown>,
  aliases: string[],
) {
  const wanted =
    new Set(
      aliases.map(normalizeHeader),
    );

  for (
    const [key, value]
    of Object.entries(row)
  ) {
    if (
      wanted.has(
        normalizeHeader(key),
      )
    ) {
      return value;
    }
  }

  return null;
}


function priceCents(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  let amount: number;

  if (
    typeof value === "number"
  ) {
    amount = value;
  } else {
    const text =
      String(value)
        .trim()
        .replace(/\$/g, "")
        .replace(/,/g, "");

    if (
      !text ||
      text.includes("%")
    ) {
      return null;
    }

    amount = Number(text);
  }

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return null;
  }

  const cents =
    Math.round(amount * 100);

  return Number.isSafeInteger(cents)
    ? cents
    : null;
}


function dateValue(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    value instanceof Date &&
    Number.isFinite(
      value.getTime(),
    )
  ) {
    return value.toISOString();
  }

  if (
    typeof value === "number"
  ) {
    const decoded =
      XLSX.SSF.parse_date_code(
        value,
      );

    if (decoded) {
      const date =
        new Date(
          Date.UTC(
            decoded.y,
            decoded.m - 1,
            decoded.d,
            decoded.H,
            decoded.M,
            Math.floor(decoded.S),
          ),
        );

      if (
        Number.isFinite(
          date.getTime(),
        )
      ) {
        return date.toISOString();
      }
    }

    return null;
  }

  const date =
    new Date(String(value));

  return Number.isFinite(
    date.getTime(),
  )
    ? date.toISOString()
    : null;
}


function safeJson(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value),
  ) as Record<string, unknown>;
}


function parseWorkbook(
  buffer: Buffer,
): ParsedSourceRow[] {
  let workbook: XLSX.WorkBook;

  try {
    workbook =
      XLSX.read(buffer, {
        type: "buffer",
        cellDates: true,
      });
  } catch {
    throw new SaleImportError(
      400,
      "The uploaded file could not be read as an Excel or CSV price sheet.",
    );
  }

  const parsed:
    ParsedSourceRow[] = [];

  for (
    const sheetName
    of workbook.SheetNames
  ) {
    const sheet =
      workbook.Sheets[
        sheetName
      ];

    if (!sheet) {
      continue;
    }

    const rows =
      XLSX.utils.sheet_to_json<
        Record<string, unknown>
      >(sheet, {
        defval: null,
        raw: true,
      });

    for (
      let index = 0;
      index < rows.length;
      index++
    ) {
      if (
        parsed.length >=
        MAX_ROWS
      ) {
        throw new SaleImportError(
          400,
          `Price sheets are limited to ${MAX_ROWS} data rows per import.`,
        );
      }

      const row = rows[index];

      const itemName =
        textValue(
          valueFromAliases(
            row,
            [
              "product",
              "product name",
              "item",
              "item name",
              "model",
              "model name",
              "description",
            ],
          ),
        );

      const sku =
        textValue(
          valueFromAliases(
            row,
            [
              "sku",
              "item number",
              "item no",
              "part number",
              "part no",
              "model number",
              "model no",
            ],
          ),
          120,
        );

      const msrpCents =
        priceCents(
          valueFromAliases(
            row,
            [
              "msrp",
              "retail",
              "retail price",
              "list price",
              "map",
              "map price",
            ],
          ),
        );

      const saleCents =
        priceCents(
          valueFromAliases(
            row,
            [
              "sale",
              "sale price",
              "promo price",
              "promotional price",
              "special price",
            ],
          ),
        );

      const dealerCostCents =
        priceCents(
          valueFromAliases(
            row,
            [
              "dealer cost",
              "dealer price",
              "cost",
              "promo dealer cost",
              "promotional dealer cost",
            ],
          ),
        );

      const startsAt =
        dateValue(
          valueFromAliases(
            row,
            [
              "sale start",
              "start date",
              "promo start",
              "promotion start",
              "effective date",
            ],
          ),
        );

      const endsAt =
        dateValue(
          valueFromAliases(
            row,
            [
              "sale end",
              "end date",
              "promo end",
              "promotion end",
              "expiration date",
              "expires",
            ],
          ),
        );

      const saleMessage =
        textValue(
          valueFromAliases(
            row,
            [
              "sale message",
              "promo message",
              "promotion message",
              "notes",
            ],
          ),
          250,
        );

      parsed.push({
        sheetName:
          sheetName.slice(
            0,
            120,
          ),

        rowNumber:
          index + 2,

        raw:
          safeJson(row),

        itemName,
        sku,
        msrpCents,
        saleCents,
        dealerCostCents,
        startsAt,
        endsAt,
        saleMessage,
      });
    }
  }

  if (!parsed.length) {
    throw new SaleImportError(
      400,
      "No data rows were found in the uploaded price sheet.",
    );
  }

  return parsed;
}


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
      "id,name,slug,brand",
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

  const candidates:
    Candidate[] =
      products.map(
        (row) => ({
          kind: "product",
          id: String(row.id),
          productId:
            String(row.id),
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
        "id,product_id,name,variant_slug",
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
        "id,product_id,name,option_slug",
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
        "id,product_id,package_name,package_slug",
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
    });
  }

  return candidates;
}


function matchRow(
  row: ParsedSourceRow,
  candidates: Candidate[],
) {
  const searchTokens =
    [
      row.itemName,
      row.sku,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      )
      .map(normalizeToken)
      .filter(Boolean);

  if (
    !searchTokens.length
  ) {
    return null;
  }

  const matches =
    candidates.filter(
      (candidate) =>
        candidate.aliases
          .map(normalizeToken)
          .filter(Boolean)
          .some(
            (alias) =>
              searchTokens.includes(
                alias,
              ),
          ),
    );

  if (
    matches.length !== 1
  ) {
    return null;
  }

  return matches[0];
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

  const brand =
    await canonicalBrand(
      requestedBrand,
    );

  const buffer =
    Buffer.from(
      await file.arrayBuffer(),
    );

  const parsed =
    parseWorkbook(buffer);

  const candidates =
    await loadCandidates(
      brand,
    );

  const prepared =
    parsed.map(
      (row) => {
        const hasUsefulValues =
          Boolean(
            row.itemName ||
            row.sku ||
            row.msrpCents !==
              null ||
            row.saleCents !==
              null ||
            row.dealerCostCents !==
              null,
          );

        const candidate =
          hasUsefulValues
            ? matchRow(
                row,
                candidates,
              )
            : null;

        const matchStatus: SaleImportPreviewRow["matchStatus"] =
          !hasUsefulValues
            ? "skipped"
            : candidate
              ? "matched"
              : "needs_review";

        return {
          row,
          candidate,
          matchStatus,
        };
      },
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
        parsed.length,

      safe_match_count:
        safeMatchCount,

      needs_review_count:
        needsReviewCount,

      applied_row_count: 0,
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
          candidate
            ? 1
            : null,

        approved: false,

        proposed_display_msrp_price_cents:
          row.msrpCents,

        proposed_sale_price_cents:
          row.saleCents,

        proposed_sale_starts_at:
          row.startsAt,

        proposed_sale_ends_at:
          row.endsAt,

        proposed_promotional_dealer_cost_cents:
          row.dealerCostCents,

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
    await privateClient
      .from(
        "catalog_sale_imports",
      )
      .update({
        status: "failed",
        storage_path:
          storagePath,

        failure_message:
          "Parsed spreadsheet rows could not be saved.",
      })
      .eq(
        "id",
        importId,
      );

    throw rowsError;
  }

  await privateClient
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
              candidate
                ? 1
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
              row.msrpCents,

            proposedSaleCents:
              row.saleCents,

            proposedDealerCostCents:
              row.dealerCostCents,

            proposedSaleStartsAt:
              row.startsAt,

            proposedSaleEndsAt:
              row.endsAt,

            proposedSaleMessage:
              row.saleMessage,
          }),
        );

  return {
    importId,
    manufacturerBrand:
      brand,

    originalFileName:
      file.name,

    parsedRowCount:
      parsed.length,

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
      "id,manufacturer_brand,original_file_name,status,parsed_row_count,safe_match_count,needs_review_count,applied_row_count,failure_message,created_at,applied_at",
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
  proposedDealerCostCents: number | null;
  proposedSaleStartsAt: string | null;
  proposedSaleEndsAt: string | null;
  proposedSaleMessage: string | null;
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
      "id,manufacturer_brand,original_file_name,status,parsed_row_count,safe_match_count,needs_review_count,applied_row_count,failure_message,created_at,applied_at",
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

  const {
    data: rows,
    error: rowsError,
  } = await privateClient
    .from(
      "catalog_sale_import_rows",
    )
    .select(
      "id,sheet_name,source_row_number,manufacturer_item_name,manufacturer_sku,product_id,variant_id,option_id,package_id,match_status,match_confidence,approved,proposed_display_msrp_price_cents,proposed_sale_price_cents,proposed_sale_starts_at,proposed_sale_ends_at,proposed_promotional_dealer_cost_cents,proposed_sale_message,applied_at",
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
            candidates,
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

          itemName:
            typeof row.manufacturer_item_name ===
            "string"
              ? row.manufacturer_item_name
              : null,

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

          proposedSaleMessage:
            typeof row.proposed_sale_message ===
            "string"
              ? row.proposed_sale_message
              : null,

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
      candidates
        .map(
          candidate => ({
            kind:
              candidate.kind,

            id:
              candidate.id,

            label:
              candidate.label,
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
      "id,manufacturer_brand,status",
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
      "id,match_status,approved,product_id,variant_id,option_id,package_id",
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

      const candidate =
        candidates.find(
          item =>
            item.kind ===
              targetKind &&
            item.id ===
              targetId,
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
            "matched",

          match_confidence:
            null,
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
