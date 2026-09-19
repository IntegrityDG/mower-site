import * as XLSX from "xlsx";

import { addDays, centralLocalToUtc } from "@/lib/scheduling/time";

const MAX_HEADER_NONEMPTY_ROWS = 20;
const MAX_ROWS = 2_000;
const MAX_MONEY_CENTS = 2_147_483_647;

export type SaleImportColumnRole =
  | "product"
  | "sku"
  | "msrp"
  | "sale"
  | "dealer_cost"
  | "discount"
  | "sale_start"
  | "sale_end"
  | "sale_message";

export type SaleImportPricingScope = "generic" | "y40" | "y40p";

export type SaleImportCandidate = {
  kind: "product" | "variant" | "option" | "package";
  id: string;
  productId: string | null;
  productSlug: string | null;
  brand: string;
  label: string;
  slug: string | null;
  sku: string | null;
  aliases: string[];
  componentSignature: string[];
  y40PriceMode: "package" | "core_specific" | null;
  currentDisplayMsrpCents: number | null;
  currentSaleCents: number | null;
  publicStatus: string | null;
};

export type ParsedSaleImportRow = {
  sheetName: string;
  rowNumber: number;
  raw: Record<string, unknown>;
  itemName: string | null;
  baseItemName: string | null;
  sku: string | null;
  msrpCents: number | null;
  saleCents: number | null;
  discountCents: number | null;
  dealerCostCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  promotionLabel: string | null;
  saleMessage: string | null;
  componentSignature: string[];
  validationErrors: string[];
  hasUsefulValues: boolean;
};

export type ParsedSaleImportWorkbook = {
  sheetName: string;
  headerRowNumber: number;
  headerMapping: Partial<Record<SaleImportColumnRole, string>>;
  detectedManufacturerBrand: string | null;
  pricingScope: SaleImportPricingScope;
  promotionLabel: string | null;
  promotionStartsAt: string | null;
  promotionEndsAt: string | null;
  rows: ParsedSaleImportRow[];
};

export type MatchedSaleImportRow = {
  row: ParsedSaleImportRow;
  candidate: SaleImportCandidate | null;
  matchStatus: "matched" | "needs_review" | "skipped";
  matchConfidence: number | null;
  matchMethod: string | null;
  matchReason: string | null;
  suggestions: SaleImportCandidate[];
};

export class SaleImportParseError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SaleImportParseError";
    this.code = code;
  }
}

type ClassifiedHeader = {
  role: SaleImportColumnRole;
  score: number;
};

type HeaderCandidate = {
  sheetName: string;
  matrix: unknown[][];
  rowIndex: number;
  score: number;
  ambiguous: boolean;
  mapping: Partial<Record<SaleImportColumnRole, number>>;
  headers: string[];
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const KNOWN_MANUFACTURERS = ["Yarbo", "Lymow", "Pandag"] as const;

const VERIFIED_YARBO_ALIASES: Record<
  string,
  { kind: SaleImportCandidate["kind"]; slug: string; scope?: SaleImportPricingScope }
> = {
  "yarbo core": { kind: "product", slug: "yarbo", scope: "y40" },
  "y40 core": { kind: "product", slug: "yarbo", scope: "y40" },
  "y40p core": { kind: "variant", slug: "yarbo-y40p", scope: "y40p" },
  "trimmer package": { kind: "option", slug: "yarbo-trimmer-module" },
};

function textValue(value: unknown, max = 250): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\r\n?/g, "\n").trim();
  return text ? text.slice(0, max) : null;
}

export function normalizeSaleImportText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string) {
  return new Set(normalizeSaleImportText(value).split(" ").filter(Boolean));
}

function hasAny(values: Set<string>, wanted: string[]) {
  return wanted.some((value) => values.has(value));
}

export function classifySaleImportHeader(value: unknown): ClassifiedHeader | null {
  const header = textValue(value, 500);
  if (!header) return null;
  const normalized = normalizeSaleImportText(header);
  const words = tokens(header);
  const hasPrice = hasAny(words, ["price", "msrp", "retail", "list", "cost", "map"]);
  const hasSale = hasAny(words, ["sale", "flash", "promo", "promotional", "special"]);
  const hasDealer = words.has("dealer");

  const scores: ClassifiedHeader[] = [];

  if (
    normalized === "product" ||
    normalized === "product name" ||
    normalized === "item" ||
    normalized === "item name" ||
    normalized === "model" ||
    normalized === "model name" ||
    normalized === "description"
  ) {
    scores.push({ role: "product", score: normalized === "product" ? 120 : 105 });
  } else if (hasAny(words, ["product", "item", "model"]) && !hasPrice) {
    scores.push({ role: "product", score: 80 });
  }

  if (
    normalized === "sku" ||
    /^(item|part|model) (number|no)$/.test(normalized)
  ) {
    scores.push({ role: "sku", score: 100 });
  }

  if (words.has("discount")) scores.push({ role: "discount", score: 110 });
  if (hasDealer && hasAny(words, ["price", "cost"])) {
    scores.push({ role: "dealer_cost", score: 125 + (words.has("cost") ? 5 : 0) });
  }
  if (hasSale && hasPrice && !hasDealer) {
    scores.push({
      role: "sale",
      score: 120 + (words.has("flash") ? 8 : 0) + (words.has("msrp") ? 3 : 0),
    });
  }
  if (
    hasAny(words, ["msrp", "retail", "list", "map"]) &&
    !hasDealer &&
    !hasSale &&
    !words.has("discount")
  ) {
    scores.push({
      role: "msrp",
      score: 105 + (words.has("standard") ? 10 : 0) + (words.has("msrp") ? 5 : 0),
    });
  }
  if (hasAny(words, ["start", "effective"]) && hasAny(words, ["sale", "promo", "promotion", "date"])) {
    scores.push({ role: "sale_start", score: 95 });
  }
  if (hasAny(words, ["end", "expires", "expiration"]) && hasAny(words, ["sale", "promo", "promotion", "date"])) {
    scores.push({ role: "sale_end", score: 95 });
  }
  if (hasAny(words, ["message", "notes"]) && hasAny(words, ["sale", "promo", "promotion", "notes"])) {
    scores.push({ role: "sale_message", score: 75 });
  }

  return scores.sort((a, b) => b.score - a.score)[0] ?? null;
}

function rowIsNonempty(row: unknown[]) {
  return row.some((value) => textValue(value, 1) !== null);
}

function matrixForSheet(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
}

function headerCandidate(
  sheetName: string,
  matrix: unknown[][],
  rowIndex: number,
): HeaderCandidate | null {
  const row = matrix[rowIndex] ?? [];
  const classifications = row.map(classifySaleImportHeader);
  const byRole = new Map<SaleImportColumnRole, Array<{ index: number; score: number }>>();

  classifications.forEach((classification, index) => {
    if (!classification) return;
    const current = byRole.get(classification.role) ?? [];
    current.push({ index, score: classification.score });
    byRole.set(classification.role, current);
  });

  if (!byRole.has("product")) return null;
  if (!["msrp", "sale", "dealer_cost", "discount"].some((role) => byRole.has(role as SaleImportColumnRole))) {
    return null;
  }

  const mapping: Partial<Record<SaleImportColumnRole, number>> = {};
  let score = 0;
  let ambiguous = false;
  for (const [role, matches] of byRole) {
    const ranked = matches.sort((a, b) => b.score - a.score || a.index - b.index);
    if (ranked.length > 1 && ranked[0].score === ranked[1].score) ambiguous = true;
    mapping[role] = ranked[0].index;
    score += ranked[0].score;
  }

  score += Object.keys(mapping).length * 20;
  return {
    sheetName,
    matrix,
    rowIndex,
    score,
    ambiguous,
    mapping,
    headers: row.map((value, index) => textValue(value, 500) ?? `Column ${index + 1}`),
  };
}

function findHeader(workbook: XLSX.WorkBook): HeaderCandidate {
  const candidates: HeaderCandidate[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = matrixForSheet(sheet);
    let nonemptySeen = 0;
    for (let rowIndex = 0; rowIndex < matrix.length && nonemptySeen < MAX_HEADER_NONEMPTY_ROWS; rowIndex += 1) {
      if (!rowIsNonempty(matrix[rowIndex] ?? [])) continue;
      nonemptySeen += 1;
      const candidate = headerCandidate(sheetName, matrix, rowIndex);
      if (candidate) candidates.push(candidate);
    }
  }

  if (!candidates.length) {
    throw new SaleImportParseError(
      "NO_HEADER",
      "No unambiguous product-and-price header row was found in the first 20 non-empty rows.",
    );
  }

  candidates.sort((a, b) => b.score - a.score || a.rowIndex - b.rowIndex);
  if (candidates[0].ambiguous) {
    throw new SaleImportParseError(
      "AMBIGUOUS_HEADER",
      "The strongest price-table header maps more than one column to the same meaning. Make the intended headings explicit.",
    );
  }
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    throw new SaleImportParseError(
      "AMBIGUOUS_HEADER",
      "More than one equally strong price-table header was found. Remove unrelated tables or make the intended headings explicit.",
    );
  }
  return candidates[0];
}

function safeJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

function rawRecord(headers: string[], row: unknown[]) {
  const result: Record<string, unknown> = {};
  const used = new Map<string, number>();
  headers.forEach((header, index) => {
    const count = used.get(header) ?? 0;
    used.set(header, count + 1);
    result[count === 0 ? header : `${header} (${count + 1})`] = safeJsonValue(row[index] ?? null);
  });
  return result;
}

function parseMoney(value: unknown): { value: number | null; invalid: boolean } {
  if (value === null || value === undefined || value === "") return { value: null, invalid: false };
  if (typeof value === "number") {
    const cents = Math.round(value * 100);
    return Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - cents) < 1e-7 &&
      Number.isSafeInteger(cents) && cents <= MAX_MONEY_CENTS
      ? { value: cents, invalid: false }
      : { value: null, invalid: true };
  }
  const text = String(value).trim().replace(/^\$/, "").replace(/,/g, "").trim();
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(text)) return { value: null, invalid: true };
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_MONEY_CENTS
    ? { value: cents, invalid: false }
    : { value: null, invalid: true };
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "number") {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (!decoded) return null;
    const date = new Date(Date.UTC(decoded.y, decoded.m - 1, decoded.d, decoded.H, decoded.M, Math.floor(decoded.S)));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function datePartsAreValid(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function workbookEvidence(candidate: HeaderCandidate, fileName: string) {
  const preamble = candidate.matrix
    .slice(0, candidate.rowIndex)
    .flat()
    .map((value) => textValue(value, 500))
    .filter((value): value is string => Boolean(value));
  return [fileName, candidate.sheetName, ...preamble, ...candidate.headers].join("\n");
}

function detectManufacturer(evidence: string) {
  const normalized = normalizeSaleImportText(evidence);
  const matches = KNOWN_MANUFACTURERS.filter((brand) =>
    new RegExp(`\\b${brand.toLowerCase()}\\b`).test(normalized),
  );
  return matches.length === 1 ? matches[0] : null;
}

function detectScope(evidence: string): SaleImportPricingScope {
  const normalized = normalizeSaleImportText(evidence);
  const hasY40p = /\by40p\b/.test(normalized);
  const withoutY40p = normalized.replace(/\by40p\b/g, " ");
  const hasY40 = /\by40\b/.test(withoutY40p);
  if (hasY40 && hasY40p) {
    throw new SaleImportParseError(
      "AMBIGUOUS_SCOPE",
      "The spreadsheet identifies both Y40 and Y40P pricing. Use a sheet with one explicit Core pricing scope.",
    );
  }
  return hasY40p ? "y40p" : hasY40 ? "y40" : "generic";
}

function promotionMetadata(evidence: string, scope: SaleImportPricingScope) {
  const normalizedDashes = evidence.normalize("NFKC").replace(/[\u2010-\u2015\u2212]/g, "-");
  const years = [...new Set([...normalizedDashes.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1])))];
  const monthNames = Object.keys(MONTHS).join("|");
  const expression = new RegExp(
    `\\b(\\d{1,2})\\s*(${monthNames})\\s*-\\s*(\\d{1,2})\\s*(${monthNames})?\\b`,
    "gi",
  );
  const ranges = [...normalizedDashes.matchAll(expression)].map((match) => ({
    startDay: Number(match[1]),
    startMonth: MONTHS[match[2].toLowerCase()],
    endDay: Number(match[3]),
    endMonth: MONTHS[(match[4] || match[2]).toLowerCase()],
  }));
  const uniqueRanges = [
    ...new Map(ranges.map((range) => [`${range.startMonth}-${range.startDay}:${range.endMonth}-${range.endDay}`, range])).values(),
  ];

  if (uniqueRanges.length > 1) {
    throw new SaleImportParseError(
      "AMBIGUOUS_DATES",
      "More than one promotion date range was found. Use one unambiguous range or explicit sale date columns.",
    );
  }
  if (uniqueRanges.length && years.length !== 1) {
    throw new SaleImportParseError(
      "MISSING_PROMOTION_YEAR",
      years.length > 1
        ? "The spreadsheet contains multiple possible promotion years. Make the intended year explicit."
        : "The promotion date range has no reliable year. Add the year before importing; IDS will not guess it.",
    );
  }

  let startsAt: string | null = null;
  let endsAt: string | null = null;
  if (uniqueRanges.length) {
    const range = uniqueRanges[0];
    const year = years[0];
    if (
      !datePartsAreValid(year, range.startMonth, range.startDay) ||
      !datePartsAreValid(year, range.endMonth, range.endDay)
    ) {
      throw new SaleImportParseError("INVALID_DATES", "The promotion date range is not a valid calendar range.");
    }
    const startDate = `${year}-${String(range.startMonth).padStart(2, "0")}-${String(range.startDay).padStart(2, "0")}`;
    const finalDate = `${year}-${String(range.endMonth).padStart(2, "0")}-${String(range.endDay).padStart(2, "0")}`;
    const start = centralLocalToUtc(startDate, "00:00");
    const end = centralLocalToUtc(addDays(finalDate, 1), "00:00");
    if (!start || !end || end <= start) {
      throw new SaleImportParseError("INVALID_DATES", "The promotion date range could not be resolved in America/Chicago.");
    }
    startsAt = start.toISOString();
    endsAt = end.toISOString();
  }

  const normalized = normalizeSaleImportText(evidence);
  let label: string | null = null;
  if (/\by40p flash sale\b/.test(normalized)) label = "Y40P Flash Sale";
  else if (/\by40 flash sale\b/.test(normalized)) label = "Y40 Flash Sale";
  else if (/\bflash sale\b/.test(normalized)) label = scope === "generic" ? "Flash Sale" : `${scope.toUpperCase()} Flash Sale`;

  return { startsAt, endsAt, label };
}

function baseItemName(value: string | null) {
  if (!value) return null;
  const normalized = value.normalize("NFKC");
  const parenthesis = normalized.indexOf("(");
  return (parenthesis >= 0 ? normalized.slice(0, parenthesis) : normalized).trim() || null;
}

function componentSignature(value: string | null) {
  if (!value) return [];
  const normalized = normalizeSaleImportText(value);
  const components = new Set<string>();
  if (/\blawn mower pro(?: module)?\b/.test(normalized)) components.add("yarbo-lawn-mower-pro-module");
  if (/\bsnow blower(?: module)?\b/.test(normalized)) components.add("yarbo-snow-blower-module");
  if (/\bleaf blower(?: module)?\b/.test(normalized)) components.add("yarbo-leaf-blower-module");
  if (/\btrimmer(?: package| module)?\b/.test(normalized)) components.add("yarbo-trimmer-module");
  return [...components].sort();
}

function valueAt(row: unknown[], mapping: Partial<Record<SaleImportColumnRole, number>>, role: SaleImportColumnRole) {
  const index = mapping[role];
  return typeof index === "number" ? row[index] : null;
}

export function parseSaleImportWorkbook(buffer: Buffer | Uint8Array, fileName: string): ParsedSaleImportWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw new SaleImportParseError(
      "INVALID_WORKBOOK",
      "The uploaded file could not be read as an Excel or CSV price sheet.",
    );
  }

  const header = findHeader(workbook);
  const evidence = workbookEvidence(header, fileName);
  const pricingScope = detectScope(evidence);
  const detectedManufacturerBrand = detectManufacturer(evidence);
  const promotion = promotionMetadata(evidence, pricingScope);
  const rows: ParsedSaleImportRow[] = [];

  for (let rowIndex = header.rowIndex + 1; rowIndex < header.matrix.length; rowIndex += 1) {
    const values = header.matrix[rowIndex] ?? [];
    if (!rowIsNonempty(values)) continue;
    if (rows.length >= MAX_ROWS) {
      throw new SaleImportParseError("TOO_MANY_ROWS", `Price sheets are limited to ${MAX_ROWS} data rows per import.`);
    }

    const itemName = textValue(valueAt(values, header.mapping, "product"));
    const sku = textValue(valueAt(values, header.mapping, "sku"), 120);
    const msrp = parseMoney(valueAt(values, header.mapping, "msrp"));
    const sale = parseMoney(valueAt(values, header.mapping, "sale"));
    const discount = parseMoney(valueAt(values, header.mapping, "discount"));
    const dealerCost = parseMoney(valueAt(values, header.mapping, "dealer_cost"));
    const explicitStart = parseDate(valueAt(values, header.mapping, "sale_start"));
    const explicitEnd = parseDate(valueAt(values, header.mapping, "sale_end"));
    const startsAt = explicitStart ?? promotion.startsAt;
    const endsAt = explicitEnd ?? promotion.endsAt;
    const validationErrors: string[] = [];

    if (!itemName && !sku) validationErrors.push("A product name or SKU is required.");
    if (msrp.invalid) validationErrors.push("Manufacturer MSRP is not a valid dollar amount.");
    if (sale.invalid) validationErrors.push("Sale price is not a valid dollar amount.");
    if (discount.invalid) validationErrors.push("Discount is not a valid dollar amount.");
    if (dealerCost.invalid) validationErrors.push("Dealer price is not a valid dollar amount.");
    if (header.mapping.sale_start !== undefined && valueAt(values, header.mapping, "sale_start") && !explicitStart) {
      validationErrors.push("Sale start is not a valid date.");
    }
    if (header.mapping.sale_end !== undefined && valueAt(values, header.mapping, "sale_end") && !explicitEnd) {
      validationErrors.push("Sale end is not a valid date.");
    }
    if (header.mapping.discount !== undefined && discount.value === null && !discount.invalid) {
      validationErrors.push("Discount is required for this pricing row.");
    }
    if (
      msrp.value !== null &&
      discount.value !== null &&
      sale.value !== null &&
      msrp.value - discount.value !== sale.value
    ) {
      validationErrors.push("Manufacturer MSRP minus discount does not equal the explicit sale price.");
    }
    if (sale.value !== null && (!startsAt || !endsAt)) {
      validationErrors.push("Temporary sale pricing requires an unambiguous start and exclusive end date.");
    }
    if (dealerCost.value !== null && !endsAt) {
      validationErrors.push("Promotional dealer cost requires an exclusive end date.");
    }
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      validationErrors.push("Promotion end must be after promotion start.");
    }

    const hasUsefulValues = Boolean(
      itemName || sku || msrp.value !== null || sale.value !== null || dealerCost.value !== null,
    );
    rows.push({
      sheetName: header.sheetName.slice(0, 120),
      rowNumber: rowIndex + 1,
      raw: rawRecord(header.headers, values),
      itemName,
      baseItemName: baseItemName(itemName),
      sku,
      msrpCents: msrp.value,
      saleCents: sale.value,
      discountCents: discount.value,
      dealerCostCents: dealerCost.value,
      startsAt,
      endsAt,
      promotionLabel: promotion.label,
      saleMessage: textValue(valueAt(values, header.mapping, "sale_message"), 250),
      componentSignature: componentSignature(itemName),
      validationErrors,
      hasUsefulValues,
    });
  }

  if (!rows.length || !rows.some((row) => row.hasUsefulValues)) {
    throw new SaleImportParseError("NO_DATA_ROWS", "No usable pricing rows were found below the detected header.");
  }

  const headerMapping: Partial<Record<SaleImportColumnRole, string>> = {};
  for (const [role, index] of Object.entries(header.mapping)) {
    if (typeof index === "number") headerMapping[role as SaleImportColumnRole] = header.headers[index];
  }

  return {
    sheetName: header.sheetName.slice(0, 120),
    headerRowNumber: header.rowIndex + 1,
    headerMapping,
    detectedManufacturerBrand,
    pricingScope,
    promotionLabel: promotion.label,
    promotionStartsAt: promotion.startsAt,
    promotionEndsAt: promotion.endsAt,
    rows,
  };
}

export function assertSaleImportBrandMatches(
  detectedBrand: string | null,
  selectedBrand: string,
) {
  if (detectedBrand && detectedBrand.toLowerCase() !== selectedBrand.trim().toLowerCase()) {
    throw new SaleImportParseError(
      "MANUFACTURER_MISMATCH",
      `This spreadsheet appears to be a ${detectedBrand} price sheet, but ${selectedBrand.trim()} was selected.`,
    );
  }
}

function candidateAllowedForScope(candidate: SaleImportCandidate, scope: SaleImportPricingScope) {
  if (candidate.brand.toLowerCase() !== "yarbo" || scope === "generic") return true;
  if (scope === "y40p") return candidate.kind === "variant" && candidate.slug === "yarbo-y40p";
  if (candidate.productSlug !== "yarbo") return false;
  if (candidate.kind === "variant") return false;
  if (candidate.kind === "package") return candidate.y40PriceMode === "package";
  return candidate.kind === "product" ? candidate.slug === "yarbo" : true;
}

function sameSignature(left: string[], right: string[]) {
  return left.length > 0 && left.length === right.length && left.every((value, index) => value === right[index]);
}

function resolveUnique(
  candidates: SaleImportCandidate[],
  method: string,
  reason: string,
): { candidate: SaleImportCandidate | null; method: string | null; reason: string | null; ambiguous: boolean } | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return { candidate: candidates[0], method, reason, ambiguous: false };
  return {
    candidate: null,
    method: null,
    reason: `Multiple IDS catalog records matched at the ${reason.toLowerCase()} step.`,
    ambiguous: true,
  };
}

function similarity(source: string, target: string) {
  const sourceTokens = tokens(source);
  const targetTokens = tokens(target);
  if (!sourceTokens.size || !targetTokens.size) return 0;
  const intersection = [...sourceTokens].filter((value) => targetTokens.has(value)).length;
  const union = new Set([...sourceTokens, ...targetTokens]).size;
  return intersection / union;
}

export function suggestSaleImportCandidates(
  row: Pick<ParsedSaleImportRow, "itemName" | "baseItemName">,
  candidates: SaleImportCandidate[],
  scope: SaleImportPricingScope,
) {
  const source = row.baseItemName ?? row.itemName ?? "";
  return candidates
    .filter((candidate) => candidateAllowedForScope(candidate, scope))
    .map((candidate) => ({ candidate, score: similarity(source, candidate.label) }))
    .filter((entry) => entry.score >= 0.35)
    .sort((a, b) => b.score - a.score || a.candidate.label.localeCompare(b.candidate.label))
    .slice(0, 3)
    .map((entry) => entry.candidate);
}

export function matchSaleImportRow(
  row: ParsedSaleImportRow,
  candidates: SaleImportCandidate[],
  scope: SaleImportPricingScope,
) {
  const allowed = candidates.filter((candidate) => candidateAllowedForScope(candidate, scope));
  const sku = row.sku ? normalizeSaleImportText(row.sku) : "";
  const fullName = row.itemName ? normalizeSaleImportText(row.itemName) : "";
  const baseName = row.baseItemName ? normalizeSaleImportText(row.baseItemName) : "";
  const stages: Array<() => ReturnType<typeof resolveUnique>> = [
    () => sku
      ? resolveUnique(
          allowed.filter((candidate) => candidate.sku && normalizeSaleImportText(candidate.sku) === sku),
          "exact_sku",
          "Exact SKU",
        )
      : null,
    () => fullName
      ? resolveUnique(
          allowed.filter((candidate) => normalizeSaleImportText(candidate.label) === fullName),
          "exact_name",
          "Exact normalized catalog name",
        )
      : null,
    () => fullName
      ? resolveUnique(
          allowed.filter((candidate) =>
            [candidate.slug, ...candidate.aliases]
              .filter((value): value is string => Boolean(value))
              .some((value) => normalizeSaleImportText(value) === fullName),
          ),
          "exact_alias",
          "Exact normalized slug or alias",
        )
      : null,
    () => baseName
      ? resolveUnique(
          allowed.filter((candidate) => normalizeSaleImportText(candidate.label) === baseName),
          "exact_base_name",
          "Exact normalized base name",
        )
      : null,
    () => row.componentSignature.length
      ? resolveUnique(
          allowed.filter(
            (candidate) => candidate.kind === "package" && sameSignature(row.componentSignature, candidate.componentSignature),
          ),
          "component_signature",
          "Exact verified package component signature",
        )
      : null,
    () => {
      const alias = VERIFIED_YARBO_ALIASES[baseName];
      if (!alias || (alias.scope && alias.scope !== scope)) return null;
      return resolveUnique(
        allowed.filter((candidate) => candidate.kind === alias.kind && candidate.slug === alias.slug),
        "verified_alias",
        "Verified manufacturer alias",
      );
    },
  ];

  for (const stage of stages) {
    const result = stage();
    if (result) return result;
  }
  return { candidate: null, method: null, reason: "No deterministic IDS catalog match was found.", ambiguous: false };
}

export function matchSaleImportRows(
  workbook: ParsedSaleImportWorkbook,
  candidates: SaleImportCandidate[],
): MatchedSaleImportRow[] {
  return workbook.rows.map((row) => {
    if (!row.hasUsefulValues) {
      return {
        row,
        candidate: null,
        matchStatus: "skipped" as const,
        matchConfidence: null,
        matchMethod: null,
        matchReason: "The row contains no product identity or pricing values.",
        suggestions: [],
      };
    }
    const match = matchSaleImportRow(row, candidates, workbook.pricingScope);
    const unsupportedY40pPackage = workbook.pricingScope === "y40p" &&
      !(match.candidate?.kind === "variant" && match.candidate.slug === "yarbo-y40p");
    const validationErrors = unsupportedY40pPackage
      ? [...row.validationErrors, "Y40P package imports require a core-specific package target and are not supported by this importer."]
      : row.validationErrors;
    if (validationErrors.length || !match.candidate) {
      return {
        row: validationErrors === row.validationErrors ? row : { ...row, validationErrors },
        candidate: match.candidate,
        matchStatus: "needs_review" as const,
        matchConfidence: match.candidate ? 1 : null,
        matchMethod: match.method,
        matchReason: validationErrors[0] ?? match.reason,
        suggestions: suggestSaleImportCandidates(row, candidates, workbook.pricingScope),
      };
    }
    return {
      row,
      candidate: match.candidate,
      matchStatus: "matched" as const,
      matchConfidence: 1,
      matchMethod: match.method,
      matchReason: match.reason,
      suggestions: [],
    };
  });
}

export function saleImportCandidateAllowedForScope(
  candidate: SaleImportCandidate,
  scope: SaleImportPricingScope,
) {
  return candidateAllowedForScope(candidate, scope);
}
