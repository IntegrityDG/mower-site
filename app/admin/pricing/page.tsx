"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import PricingProgramToggle from "@/components/admin/PricingProgramToggle";
import PackageCorePricing from "@/components/admin/PackageCorePricing";
import { centralDateTimeInputToIso, isoToLocalDateTimeInput } from "@/lib/admin-pricing/datetime-local";
import { editablePricingFields } from "@/lib/admin-pricing/validation";
import type { PricingItem } from "@/lib/admin-pricing/types";
import { grossMarginPercent, grossProfitCents } from "@/lib/admin-pricing/gross-margin";
import { sellingPriceDecision } from "@/lib/pricing-program/policy";
const labels: Record<string, string> = { display_msrp_price_cents: "Manufacturer / MSRP", regular_price_cents: "IDS Everyday Low Price", sale_price_cents: "Temporary Sale Price", sale_starts_at: "Sale Start", sale_ends_at: "Sale End", promotion_label: "Promotion Label", show_public_price: "Show Public Price", contact_for_pricing: "Contact for Pricing", override_display_msrp_price_cents: "Manufacturer / MSRP Override", override_regular_price_cents: "IDS Everyday Low Price Override", override_sale_price_cents: "Temporary Sale Price Override", override_sale_starts_at: "Sale Start Override", override_sale_ends_at: "Sale End Override", override_promotion_label: "Promotion Label Override", override_show_public_price: "Show Public Price Override", override_contact_for_pricing: "Contact for Pricing Override", is_available: "Available", schedule_name: "Schedule Name", starts_at: "Starts At", ends_at: "Ends At", public_status: "Public Status" };
const priceFields = new Set(["display_msrp_price_cents", "regular_price_cents", "sale_price_cents", "override_display_msrp_price_cents", "override_regular_price_cents", "override_sale_price_cents"]);
const fieldLabel = (kind: PricingItem["kind"], field: string) => {
    if (field === "preorder_enabled") return <>Pre-Order Enabled<span className="mt-2 block rounded-xl bg-violet-50 p-3 text-sm font-semibold text-violet-950">Allows a Coming Soon variant to be ordered only during its Sale Start through Sale End window. Both dates are required; the end is exclusive. Price schedules do not extend this authorization.</span></>;
    if (field === "name" || field === "package_name") {
        return <>{field === "name" ? "Catalog Display Name" : "Package Display Name"}<span className="mt-2 block rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-950">Changing the display name does not change the item&apos;s ID, slug, pricing, package contents, or checkout relationships.</span></>;
    }
    return kind === "schedules" && field === "regular_price_cents" ? "Scheduled IDS Price" : kind === "schedules" && field === "sale_price_cents" ? "Scheduled Sale Price" : labels[field] ?? field;
};
const dateFields = new Set(["sale_starts_at", "sale_ends_at", "override_sale_starts_at", "override_sale_ends_at", "starts_at", "ends_at"]);
const booleanFields = new Set(["preorder_enabled", "show_public_price", "contact_for_pricing", "is_available"]);
const nullableBooleanFields = new Set(["override_show_public_price", "override_contact_for_pricing"]);
type SaleImportPreviewRow = {
    id?: string;
    sheetName: string;
    rowNumber: number;
    itemName: string | null;
    sku: string | null;
    matchStatus: "matched" | "needs_review" | "skipped";
    matchConfidence: number | null;
    matchedKind: "product" | "variant" | "option" | "package" | null;
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
        kind: "product" | "variant" | "option" | "package";
        id: string;
        label: string;
    }>;
};

type SaleImportPreview = {
    importId: string;
    manufacturerBrand: string;
    originalFileName: string;
    parsedRowCount: number;
    safeMatchCount: number;
    needsReviewCount: number;
    skippedCount: number;
    previewLimited: boolean;
    detectedManufacturerBrand: string | null;
    pricingScope: "generic" | "y40" | "y40p";
    promotionLabel: string | null;
    promotionStartsAt: string | null;
    promotionEndsAt: string | null;
    headerSheetName: string;
    headerRowNumber: number;
    columnMapping: Record<string, string>;
    rows: SaleImportPreviewRow[];
};

type SaleImportHistory = {
    id: string;
    manufacturer_brand: string;
    original_file_name: string;
    status: string;
    parsed_row_count: number;
    safe_match_count: number;
    needs_review_count: number;
    applied_row_count: number;
    failure_message: string | null;
    created_at: string;
    applied_at: string | null;
    detected_manufacturer_brand: string | null;
    pricing_scope: "generic" | "y40" | "y40p" | null;
    promotion_label: string | null;
    promotion_starts_at: string | null;
    promotion_ends_at: string | null;
    header_sheet_name: string | null;
    header_row_number: number | null;
    column_mapping: Record<string, string>;
};
type SaleImportReviewCandidate = {
    kind: "product" | "variant" | "option" | "package";
    id: string;
    label: string;
    slug: string | null;
    productSlug: string | null;
    y40PriceMode: "package" | "core_specific" | null;
    currentMsrpCents: number | null;
    currentSaleCents: number | null;
    publicStatus: string | null;
};

type SaleImportReviewRow = {
    id: string;
    sheetName: string | null;
    rowNumber: number | null;
    itemName: string | null;
    sku: string | null;
    matchStatus: "matched" | "needs_review" | "skipped" | "applied";
    approved: boolean;
    matchConfidence: number | null;
    matchedKind: "product" | "variant" | "option" | "package" | null;
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

type SaleImportReviewData = {
    import: SaleImportHistory;
    candidates: SaleImportReviewCandidate[];
    rows: SaleImportReviewRow[];
};
const money = (cents: number | null) => cents === null ? "Not set" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const margin = (value: number | null) => value === null ? "Not available" : `${value.toFixed(1)}%`;
const itemPrice = (item: PricingItem, field: string) => typeof item.values[field] === "number" ? item.values[field] as number : null;
const itemDate = (item: PricingItem, field: string) => typeof item.values[field] === "string" ? item.values[field] as string : null;
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" }).format(new Date(value));
const dateTimeLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value)) : "Not detected";
type PricingView = "overview" | "manual" | "services" | "imports" | "schedules" | "program";
const equipmentKinds = new Set<PricingItem["kind"]>(["products", "variants", "packages", "options"]);
const serviceKinds = new Set<PricingItem["kind"]>(["services", "service-payment-options", "product-services"]);
const preferredBrands = ["Lymow", "Yarbo", "Pandag", "Aftermarket"];
function PricingFacts({ item }: {
    item: PricingItem;
}) {
    if (item.kind === "schedules")
        return null;
    const prefix = item.kind === "product-services" ? "override_" : "";
    const msrp = itemPrice(item, `${prefix}display_msrp_price_cents`);
    const everyday = itemPrice(item, `${prefix}regular_price_cents`);
    const sale = itemPrice(item, `${prefix}sale_price_cents`);
    const start = itemDate(item, `${prefix}sale_starts_at`);
    const end = itemDate(item, `${prefix}sale_ends_at`);
    const everydayProfit = grossProfitCents(everyday, item.dealerCostCents);
    const saleProfit = grossProfitCents(sale, item.dealerCostCents);
    return <dl className="mt-4 grid gap-2 border-t pt-4 text-sm"><div><dt className="font-bold">Manufacturer / MSRP</dt><dd>{money(msrp)}</dd></div><div><dt className="font-bold">IDS Everyday Price</dt><dd>{money(everyday)}</dd></div><div><dt className="font-bold">Temporary Sale Price</dt><dd>{money(sale)}</dd></div>{sale !== null && (start || end) && <div><dt className="font-bold">Sale Period</dt><dd>{start ? dateLabel(start) : "Open start"} – {end ? dateLabel(end) : "No end date"}</dd></div>}<div className="mt-2 rounded-xl bg-slate-950 p-3 text-white"><dt className="font-black">🔒 Dealer Cost — PRIVATE / IDS INTERNAL ONLY</dt><dd>{item.dealerCostCents === null ? "Not set" : money(item.dealerCostCents)}</dd></div><div><dt className="font-bold">Gross Profit at Everyday Price</dt><dd>{everydayProfit === null ? "Not available" : money(everydayProfit)}</dd></div><div><dt className="font-bold">Gross Margin at Everyday Price</dt><dd>{margin(grossMarginPercent(everyday, item.dealerCostCents))}</dd></div>{sale !== null && <><div><dt className="font-bold">Gross Profit at Sale Price</dt><dd>{saleProfit === null ? "Not available" : money(saleProfit)}</dd></div><div><dt className="font-bold">Gross Margin at Sale Price</dt><dd>{margin(grossMarginPercent(sale, item.dealerCostCents))}</dd></div></>}</dl>;
}

function PricingPromotionEditor({
    item,
    onSaved,
}: {
    item: PricingItem;
    onSaved: (item: PricingItem, label: string) => void;
}) {
    const [idsMessage, setIdsMessage] = useState(item.idsPriceMessage.message ?? "");
    const [idsPublic, setIdsPublic] = useState(item.idsPriceMessage.isPublic);
    const [saleMessage, setSaleMessage] = useState(item.salePriceMessage.message ?? "");
    const [salePublic, setSalePublic] = useState(item.salePriceMessage.isPublic);
    const [savingContext, setSavingContext] = useState<"ids" | "sale" | null>(null);
    const [localMessage, setLocalMessage] = useState("");
    const [idsPreviewUrl, setIdsPreviewUrl] = useState<string | null>(null);
    const [salePreviewUrl, setSalePreviewUrl] = useState<string | null>(null);
    const [imageSavingContext, setImageSavingContext] = useState<"ids" | "sale" | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadPreview(context: "ids" | "sale") {
            const response = await fetch(
                `/api/admin/pricing/${item.kind}/${item.id}/messages/image?context=${context}`,
                {
                    cache: "no-store",
                },
            );

            if (!response.ok) {
                return;
            }

            const payload = await response.json().catch(() => ({}));

            if (cancelled) {
                return;
            }

            if (context === "ids") {
                setIdsPreviewUrl(
                    typeof payload.previewUrl === "string"
                        ? payload.previewUrl
                        : null,
                );
            } else {
                setSalePreviewUrl(
                    typeof payload.previewUrl === "string"
                        ? payload.previewUrl
                        : null,
                );
            }
        }

        void loadPreview("ids");
        void loadPreview("sale");

        return () => {
            cancelled = true;
        };
    }, [
        item.kind,
        item.id,
        item.idsPriceMessage.imagePath,
        item.salePriceMessage.imagePath,
    ]);

    async function uploadPhoto(
        context: "ids" | "sale",
        file: File,
    ) {
        setImageSavingContext(context);
        setLocalMessage("");

        try {
            const form = new FormData();
            form.set("context", context);
            form.set("file", file);

            const response = await fetch(
                `/api/admin/pricing/${item.kind}/${item.id}/messages/image`,
                {
                    method: "POST",
                    body: form,
                },
            );

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ??
                        "Promotional image could not be uploaded.",
                );
            }

            const updated = payload.item as PricingItem;

            if (context === "ids") {
                setIdsPreviewUrl(
                    typeof payload.previewUrl === "string"
                        ? payload.previewUrl
                        : null,
                );
            } else {
                setSalePreviewUrl(
                    typeof payload.previewUrl === "string"
                        ? payload.previewUrl
                        : null,
                );
            }

            const label =
                context === "ids"
                    ? "IDS Price Message photo"
                    : "Sale Price Message photo";

            setLocalMessage(
                payload.cleanupWarning
                    ? `${label} saved. The previous stored image could not be cleaned up automatically.`
                    : `${label} saved.`,
            );

            onSaved(updated, label);
        } catch (error) {
            setLocalMessage(
                error instanceof Error
                    ? error.message
                    : "Promotional image could not be uploaded.",
            );
        } finally {
            setImageSavingContext(null);
        }
    }

    async function removePhoto(context: "ids" | "sale") {
        const label =
            context === "ids"
                ? "IDS Price Message photo"
                : "Sale Price Message photo";

        if (!window.confirm(`Remove the ${label}?`)) {
            return;
        }

        setImageSavingContext(context);
        setLocalMessage("");

        try {
            const response = await fetch(
                `/api/admin/pricing/${item.kind}/${item.id}/messages/image?context=${context}`,
                {
                    method: "DELETE",
                },
            );

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ??
                        "Promotional image could not be removed.",
                );
            }

            const updated = payload.item as PricingItem;

            if (context === "ids") {
                setIdsPreviewUrl(null);
            } else {
                setSalePreviewUrl(null);
            }

            setLocalMessage(
                payload.cleanupWarning
                    ? `${label} removed from pricing. The old storage file could not be cleaned up automatically.`
                    : `${label} removed.`,
            );

            onSaved(updated, label);
        } catch (error) {
            setLocalMessage(
                error instanceof Error
                    ? error.message
                    : "Promotional image could not be removed.",
            );
        } finally {
            setImageSavingContext(null);
        }
    }

    async function saveMessage(context: "ids" | "sale") {
        const message = context === "ids" ? idsMessage : saleMessage;
        const isPublic = context === "ids" ? idsPublic : salePublic;

        setSavingContext(context);
        setLocalMessage("");

        try {
            const response = await fetch(
                `/api/admin/pricing/${item.kind}/${item.id}/messages`,
                {
                    method: "PATCH",
                    headers: {
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        context,
                        message,
                        isPublic,
                    }),
                },
            );

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ??
                        "Pricing promotional message could not be saved.",
                );
            }

            const updated = payload.item as PricingItem;

            if (context === "ids") {
                setIdsMessage(updated.idsPriceMessage.message ?? "");
                setIdsPublic(updated.idsPriceMessage.isPublic);
            } else {
                setSaleMessage(updated.salePriceMessage.message ?? "");
                setSalePublic(updated.salePriceMessage.isPublic);
            }

            const label =
                context === "ids"
                    ? "IDS Price Message"
                    : "Sale Price Message";

            setLocalMessage(`${label} saved.`);
            onSaved(updated, label);
        } catch (error) {
            setLocalMessage(
                error instanceof Error
                    ? error.message
                    : "Pricing promotional message could not be saved.",
            );
        } finally {
            setSavingContext(null);
        }
    }

    return (
        <section className="mt-6 border-t border-slate-200 pt-6">
            <div>
                <p className="text-sm font-black uppercase tracking-[.16em] text-emerald-700">
                    Price Messages
                </p>
                <h3 className="mt-1 text-xl font-black">
                    Promotional Content
                </h3>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                    Each price message can contain up to 250 characters.
                    Public display is controlled separately for each message.
                </p>
            </div>

            <div className="mt-5 grid gap-5">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="font-black">
                                IDS Price Message
                            </h4>
                            <p className="text-sm text-slate-600">
                                Used with the IDS Everyday Low Price.
                            </p>
                        </div>

                        <span className="text-sm font-black text-slate-600">
                            {idsMessage.length} / 250
                        </span>
                    </div>

                    <textarea
                        maxLength={250}
                        rows={4}
                        value={idsMessage}
                        onChange={(event) =>
                            setIdsMessage(event.target.value)
                        }
                        placeholder="Example: Free professional setup included with this machine."
                        className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white p-3"
                    />

                    <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3">
                        <p className="font-black">
                            Promotional Photo
                        </p>

                        {idsPreviewUrl ? (
                            <div className="mt-3">
                                <img
                                    src={idsPreviewUrl}
                                    alt="IDS Price Message promotional preview"
                                    className="max-h-64 w-full rounded-xl border object-contain"
                                />

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <label className="cursor-pointer rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">
                                        {imageSavingContext === "ids"
                                            ? "Uploading..."
                                            : "Replace Photo"}

                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            disabled={imageSavingContext !== null}
                                            className="sr-only"
                                            onChange={(event) => {
                                                const file =
                                                    event.target.files?.[0];

                                                if (file) {
                                                    void uploadPhoto(
                                                        "ids",
                                                        file,
                                                    );
                                                }

                                                event.currentTarget.value = "";
                                            }}
                                        />
                                    </label>

                                    <button
                                        type="button"
                                        disabled={imageSavingContext !== null}
                                        onClick={() =>
                                            void removePhoto("ids")
                                        }
                                        className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 disabled:opacity-60"
                                    >
                                        {imageSavingContext === "ids"
                                            ? "Working..."
                                            : "Remove Photo"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className="mt-3 inline-block cursor-pointer rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">
                                {imageSavingContext === "ids"
                                    ? "Uploading..."
                                    : "Add Photo"}

                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    disabled={imageSavingContext !== null}
                                    className="sr-only"
                                    onChange={(event) => {
                                        const file =
                                            event.target.files?.[0];

                                        if (file) {
                                            void uploadPhoto(
                                                "ids",
                                                file,
                                            );
                                        }

                                        event.currentTarget.value = "";
                                    }}
                                />
                            </label>
                        )}

                        <p className="mt-2 text-xs font-semibold text-slate-500">
                            One JPEG, PNG, or WebP image. Maximum 10 MB.
                        </p>
                    </div>

                    <label className="mt-3 flex cursor-pointer items-center gap-3 font-bold">
                        <input
                            type="checkbox"
                            checked={idsPublic}
                            onChange={(event) =>
                                setIdsPublic(event.target.checked)
                            }
                            className="h-5 w-5 accent-emerald-600"
                        />
                        Show Message Publicly
                    </label>

                    <p className="mt-2 text-xs font-semibold text-slate-500">
                        This controls the message only. It does not change
                        whether the actual IDS price is public.
                    </p>

                    <button
                        type="button"
                        disabled={savingContext !== null}
                        onClick={() => void saveMessage("ids")}
                        className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 font-black text-white disabled:opacity-60"
                    >
                        {savingContext === "ids"
                            ? "Saving..."
                            : "Save IDS Price Message"}
                    </button>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="font-black">
                                Sale Price Message
                            </h4>
                            <p className="text-sm text-slate-600">
                                Used with the active Temporary Sale Price.
                            </p>
                        </div>

                        <span className="text-sm font-black text-slate-600">
                            {saleMessage.length} / 250
                        </span>
                    </div>

                    <textarea
                        maxLength={250}
                        rows={4}
                        value={saleMessage}
                        onChange={(event) =>
                            setSaleMessage(event.target.value)
                        }
                        placeholder="Example: Manufacturer promotion available for a limited time."
                        className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white p-3"
                    />

                    <div className="mt-4 rounded-xl border border-blue-200 bg-white p-3">
                        <p className="font-black">
                            Promotional Photo
                        </p>

                        {salePreviewUrl ? (
                            <div className="mt-3">
                                <img
                                    src={salePreviewUrl}
                                    alt="Sale Price Message promotional preview"
                                    className="max-h-64 w-full rounded-xl border object-contain"
                                />

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <label className="cursor-pointer rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">
                                        {imageSavingContext === "sale"
                                            ? "Uploading..."
                                            : "Replace Photo"}

                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            disabled={imageSavingContext !== null}
                                            className="sr-only"
                                            onChange={(event) => {
                                                const file =
                                                    event.target.files?.[0];

                                                if (file) {
                                                    void uploadPhoto(
                                                        "sale",
                                                        file,
                                                    );
                                                }

                                                event.currentTarget.value = "";
                                            }}
                                        />
                                    </label>

                                    <button
                                        type="button"
                                        disabled={imageSavingContext !== null}
                                        onClick={() =>
                                            void removePhoto("sale")
                                        }
                                        className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 disabled:opacity-60"
                                    >
                                        {imageSavingContext === "sale"
                                            ? "Working..."
                                            : "Remove Photo"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className="mt-3 inline-block cursor-pointer rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">
                                {imageSavingContext === "sale"
                                    ? "Uploading..."
                                    : "Add Photo"}

                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    disabled={imageSavingContext !== null}
                                    className="sr-only"
                                    onChange={(event) => {
                                        const file =
                                            event.target.files?.[0];

                                        if (file) {
                                            void uploadPhoto(
                                                "sale",
                                                file,
                                            );
                                        }

                                        event.currentTarget.value = "";
                                    }}
                                />
                            </label>
                        )}

                        <p className="mt-2 text-xs font-semibold text-slate-500">
                            One JPEG, PNG, or WebP image. Maximum 10 MB.
                        </p>
                    </div>

                    <label className="mt-3 flex cursor-pointer items-center gap-3 font-bold">
                        <input
                            type="checkbox"
                            checked={salePublic}
                            onChange={(event) =>
                                setSalePublic(event.target.checked)
                            }
                            className="h-5 w-5 accent-blue-600"
                        />
                        Show Message Publicly
                    </label>

                    <p className="mt-2 text-xs font-semibold text-slate-500">
                        The public site will only use this content while
                        its Temporary Sale Price is active.
                    </p>

                    <button
                        type="button"
                        disabled={savingContext !== null}
                        onClick={() => void saveMessage("sale")}
                        className="mt-4 rounded-xl bg-blue-700 px-5 py-2.5 font-black text-white disabled:opacity-60"
                    >
                        {savingContext === "sale"
                            ? "Saving..."
                            : "Save Sale Price Message"}
                    </button>
                </div>
            </div>

            {localMessage && (
                <p
                    role="status"
                    className="mt-4 rounded-xl bg-slate-100 p-3 font-bold"
                >
                    {localMessage}
                </p>
            )}

            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">
                Message text, photos, and Public toggles do not change the
                numeric price or checkout math.
            </p>
        </section>
    );
}

function initialDraft(item: PricingItem) {
    return Object.fromEntries(editablePricingFields[item.kind].map((field) => {
        const value = item.values[field];
        if (priceFields.has(field))
            return [field, typeof value === "number" ? (value / 100).toFixed(2) : ""];
        if (dateFields.has(field))
            return [field, isoToLocalDateTimeInput(typeof value === "string" ? value : null)];
        if (nullableBooleanFields.has(field))
            return [field, value === null || value === undefined ? "inherit" : String(value)];
        return [field, value ?? ""];
    }));
}

function proposedCustomerPrice(item: PricingItem, draft: Record<string, unknown>) {
    if (item.activeScheduleName) return { price: item.effectivePriceCents, reason: `The active schedule “${item.activeScheduleName}” continues to control customer pricing.` };
    if (item.effectiveSource === "quote_only") return { price: null, reason: item.effectiveExplanation ?? "This amount is not currently customer-facing." };
    if (item.effectiveSource === "unpriced") return { price: null, reason: item.effectiveExplanation ?? "A different catalog row controls customer pricing." };
    const prefix = item.kind === "product-services" ? "override_" : "";
    const centsFromDraft = (field: string) => {
        const value = draft[field];
        if (value === "" || value === null || value === undefined) return null;
        const dollars = Number(value);
        return Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
    };
    const show = prefix ? draft.override_show_public_price !== "false" : draft.show_public_price !== false;
    const contact = prefix ? draft.override_contact_for_pricing === "true" : draft.contact_for_pricing === true;
    if (draft.public_status === "hidden") return { price: null, reason: "The catalog record will remain hidden from customers." };
    if (!show || contact) return { price: null, reason: contact ? "Contact for Pricing will suppress the customer amount." : "Show Public Price is off." };
    const decision = sellingPriceDecision({
        display_msrp_price_cents: centsFromDraft(`${prefix}display_msrp_price_cents`),
        regular_price_cents: centsFromDraft(`${prefix}regular_price_cents`),
        sale_price_cents: centsFromDraft(`${prefix}sale_price_cents`),
        sale_starts_at: centralDateTimeInputToIso(String(draft[`${prefix}sale_starts_at`] ?? "")),
        sale_ends_at: centralDateTimeInputToIso(String(draft[`${prefix}sale_ends_at`] ?? "")),
    }, item.pricingProgramEnabled !== false);
    return { price: decision.priceCents, reason: `${decision.source === "temporary_sale" ? "Temporary Sale" : decision.source === "manufacturer_msrp" ? "Manufacturer MSRP" : "IDS Everyday Low Price"} would control after save.` };
}
export default function PricingAdminPage() {
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [password, setPassword] = useState("");
    const [items, setItems] = useState<PricingItem[]>([]);
    const [message, setMessage] = useState("");
    const [search, setSearch] = useState("");
    const [kind, setKind] = useState("all");
    const [brand, setBrand] = useState("all");
    const [view, setView] = useState<PricingView>("overview");
    const [menuOpen, setMenuOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const firstMenuItemRef = useRef<HTMLButtonElement>(null);
    const editorReturnFocusRef = useRef<HTMLElement | null>(null);
    const urlInitializedRef = useRef(false);
    const [editing, setEditing] = useState<PricingItem | null>(null);
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [availabilitySavingKey, setAvailabilitySavingKey] = useState<string | null>(null);
    const [saleImportBrands, setSaleImportBrands] = useState<string[]>([]);
    const [saleImportHistory, setSaleImportHistory] = useState<SaleImportHistory[]>([]);
    const [saleImportBrand, setSaleImportBrand] = useState("");
    const [saleImportFile, setSaleImportFile] = useState<File | null>(null);
    const [saleImportPreview, setSaleImportPreview] = useState<SaleImportPreview | null>(null);
    const [saleImportLoading, setSaleImportLoading] = useState(false);
    const [saleImportMessage, setSaleImportMessage] = useState("");
    const [saleImportReviewId, setSaleImportReviewId] = useState("");
    const [saleImportReview, setSaleImportReview] = useState<SaleImportReviewData | null>(null);
    const [saleImportReviewLoading, setSaleImportReviewLoading] = useState(false);
    const [saleImportRowSaving, setSaleImportRowSaving] = useState<string | null>(null);
    const [saleImportApplying, setSaleImportApplying] = useState(false);
    const load = useCallback(async () => { const response = await fetch("/api/admin/pricing", { cache: "no-store" }); if (response.status === 401) {
        setAuthed(false);
        return;
    } const payload = await response.json().catch(() => ({})); if (response.ok) {
        setItems(payload.items);
        setAuthed(true);
        setMessage("");
    }
    else {
        setAuthed(true);
        setMessage(payload.error ?? "Pricing catalog could not be loaded.");
    } }, []);
    useEffect(() => { fetch("/api/admin/pricing", { cache: "no-store" }).then(async (response) => { if (response.status === 401) {
        setAuthed(false);
        return;
    } const payload = await response.json().catch(() => ({})); if (response.ok) {
        setItems(payload.items);
        setAuthed(true);
        setMessage("");
    }
    else {
        setAuthed(true);
        setMessage(payload.error ?? "Pricing catalog could not be loaded.");
    } }); }, []);
    const loadSaleImports = useCallback(async () => {
        const response = await fetch(
            "/api/admin/pricing/sale-imports",
            { cache: "no-store" },
        );

        if (response.status === 401) {
            return;
        }

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            setSaleImportMessage(
                payload.error ?? "Price-sheet imports could not be loaded.",
            );
            return;
        }

        const nextBrands = Array.isArray(payload.brands)
            ? payload.brands.filter((value: unknown): value is string => typeof value === "string")
            : [];

        setSaleImportBrands(nextBrands);
        setSaleImportHistory(
            Array.isArray(payload.imports) ? payload.imports : [],
        );

        setSaleImportBrand(current =>
            current || nextBrands[0] || "",
        );
    }, []);

    useEffect(() => {
        if (authed === true && view === "imports") {
            void loadSaleImports();
        }
    }, [authed, loadSaleImports, view]);

    useEffect(() => {
        if (!menuOpen) return;
        firstMenuItemRef.current?.focus();
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
            }
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [menuOpen]);

    useEffect(() => {
        if (!editing) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving) closeEditor();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [editing, saving]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!urlInitializedRef.current) return;
        const query = new URLSearchParams(window.location.search);
        query.set("view", view);
        if (view === "manual" && brand !== "all") query.set("brand", brand);
        else query.delete("brand");
        window.history.replaceState(null, "", `${window.location.pathname}?${query.toString()}`);
    }, [view, brand]);

    useEffect(() => {
        const applyLocation = () => {
            const query = new URLSearchParams(window.location.search);
            const requestedView = query.get("view");
            if (["overview", "manual", "services", "imports", "schedules", "program"].includes(requestedView ?? "")) setView(requestedView as PricingView);
            const requestedBrand = query.get("brand");
            setBrand(requestedBrand ?? "all");
            urlInitializedRef.current = true;
        };
        applyLocation();
        window.addEventListener("popstate", applyLocation);
        return () => window.removeEventListener("popstate", applyLocation);
    }, []);

    async function uploadSaleImport(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (
            saleImportLoading ||
            !saleImportFile ||
            !saleImportBrand
        ) {
            return;
        }

        setSaleImportLoading(true);
        setSaleImportMessage("");
        setSaleImportPreview(null);

        try {
            const form = new FormData();
            form.set("brand", saleImportBrand);
            form.set("file", saleImportFile);

            const response = await fetch(
                "/api/admin/pricing/sale-imports",
                {
                    method: "POST",
                    body: form,
                },
            );

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ?? "The price sheet could not be imported.",
                );
            }

            setSaleImportPreview(payload as SaleImportPreview);
            setSaleImportReviewId(String(payload.importId ?? ""));
            setSaleImportMessage(
                `Price sheet parsed successfully. ${payload.safeMatchCount ?? 0} matched automatically, ${payload.needsReviewCount ?? 0} need review, and ${payload.skippedCount ?? 0} were skipped. No live pricing has been changed.`,
            );

            await loadSaleImports();
        } catch (error) {
            setSaleImportMessage(
                error instanceof Error
                    ? error.message
                    : "The price sheet could not be imported.",
            );
        } finally {
            setSaleImportLoading(false);
        }
    }
    async function openSaleImportReview(importId: string) {
        if (!importId || saleImportReviewLoading) {
            return;
        }

        setSaleImportReviewLoading(true);
        setSaleImportMessage("");

        try {
            const response = await fetch(
                `/api/admin/pricing/sale-imports/${importId}`,
                { cache: "no-store" },
            );

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ?? "The price-sheet review could not be loaded.",
                );
            }

            setSaleImportReview(payload as SaleImportReviewData);
            setSaleImportReviewId(importId);
        } catch (error) {
            setSaleImportMessage(
                error instanceof Error
                    ? error.message
                    : "The price-sheet review could not be loaded.",
            );
        } finally {
            setSaleImportReviewLoading(false);
        }
    }

    async function updateSaleImportReviewRow(
        rowId: string,
        patch: {
            approved?: boolean;
            targetKind?: "product" | "variant" | "option" | "package" | null;
            targetId?: string | null;
        },
    ) {
        if (
            !saleImportReview ||
            saleImportRowSaving
        ) {
            return;
        }

        setSaleImportRowSaving(rowId);
        setSaleImportMessage("");

        try {
            const response = await fetch(
                `/api/admin/pricing/sale-imports/${saleImportReview.import.id}/rows/${rowId}`,
                {
                    method: "PATCH",
                    headers: {
                        "content-type": "application/json",
                    },
                    body: JSON.stringify(patch),
                },
            );

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ?? "The review row could not be updated.",
                );
            }

            const updated = payload.row as SaleImportReviewRow;

            setSaleImportReview(current =>
                current
                    ? {
                          ...current,
                          rows: current.rows.map(row =>
                              row.id === updated.id
                                  ? updated
                                  : row,
                          ),
                      }
                    : current,
            );
        } catch (error) {
            setSaleImportMessage(
                error instanceof Error
                    ? error.message
                    : "The review row could not be updated.",
            );
        } finally {
            setSaleImportRowSaving(null);
        }
    }
    async function applySaleImportReview() {
        if (
            !saleImportReview ||
            saleImportApplying
        ) {
            return;
        }

        const approvedCount =
            saleImportReview.rows.filter(
                row =>
                    row.approved &&
                    row.matchStatus === "matched",
            ).length;

        if (!approvedCount) {
            setSaleImportMessage(
                "Approve at least one matched row before applying pricing.",
            );
            return;
        }

        const confirmed = window.confirm(
            `Apply ${approvedCount} approved price-sheet row${approvedCount === 1 ? "" : "s"} to live IDS pricing?\n\nThis may change Manufacturer / MSRP, Temporary Sale Price, sale dates, temporary promotional dealer cost, and sale promotional messages.\n\nIDS Everyday Low Price will NOT be changed.`,
        );

        if (!confirmed) {
            return;
        }

        setSaleImportApplying(true);
        setSaleImportMessage("");

        try {
            const response = await fetch(
                `/api/admin/pricing/sale-imports/${saleImportReview.import.id}/apply`,
                {
                    method: "POST",
                },
            );

            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.error ??
                        "The approved price-sheet rows could not be applied.",
                );
            }

            setSaleImportMessage(
                `${payload.appliedThisRun ?? 0} approved row${payload.appliedThisRun === 1 ? "" : "s"} applied successfully. IDS Everyday Low Price was not changed.`,
            );

            await Promise.all([
                load(),
                loadSaleImports(),
            ]);

            await openSaleImportReview(
                saleImportReview.import.id,
            );
        } catch (error) {
            setSaleImportMessage(
                error instanceof Error
                    ? error.message
                    : "The approved price-sheet rows could not be applied.",
            );
        } finally {
            setSaleImportApplying(false);
        }
    }
    async function login(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/admin/reviews/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }); if (response.ok) {
        setPassword("");
        await load();
    }
    else
        setMessage("Invalid password."); }
    function closeEditor() { setEditing(null); requestAnimationFrame(() => editorReturnFocusRef.current?.focus()); }
    function edit(item: PricingItem) { editorReturnFocusRef.current = document.activeElement as HTMLElement | null; setEditing(item); setDraft(initialDraft(item)); setMessage(""); }
    async function setAvailability(item: PricingItem, status: boolean | "active" | "unavailable" | "hidden") {
        const nextStatus = typeof status === "boolean" ? status ? "active" : "unavailable" : status;
        const available = nextStatus === "active";
        if (item.availabilityStatus === nextStatus || availabilitySavingKey)
            return;
        const key = `${item.kind}:${item.id}`;
        const previousItems = items;
        setAvailabilitySavingKey(key);
        setMessage("");
        setItems(current => current.map(candidate => candidate.kind === item.kind && candidate.id === item.id ? {
            ...candidate,
            isAvailable: available,
            availabilityStatus: nextStatus,
            publicStatus: candidate.availabilityField === "public_status" ? nextStatus : candidate.publicStatus,
            values: { ...candidate.values, [candidate.availabilityField]: candidate.availabilityField === "is_available" ? available : nextStatus },
        } : candidate));
        const body = item.availabilityField === "is_available" ? { is_available: available, expectedUpdatedAt: item.updatedAt } : { public_status: nextStatus, expectedUpdatedAt: item.updatedAt };
        try {
            const response = await fetch(`/api/admin/pricing/${item.kind}/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(payload.error ?? "Availability update failed.");
            setItems(current => current.map(candidate => candidate.kind === payload.item.kind && candidate.id === payload.item.id ? payload.item : candidate));
            setMessage(`${payload.item.name} is now ${nextStatus === "active" ? "available" : nextStatus === "hidden" ? "hidden from public display" : "unavailable"}.`);
        }
        catch (error) {
            setItems(previousItems);
            setMessage(`Availability update failed: ${error instanceof Error ? error.message : "Please try again."}`);
        }
        finally {
            setAvailabilitySavingKey(null);
        }
    }
    async function save(event: FormEvent) { event.preventDefault(); if (!editing)
        return; setSaving(true); setMessage(""); const body: Record<string, unknown> = {}; for (const field of editablePricingFields[editing.kind]) {
        const value = draft[field];
        if (priceFields.has(field)) {
            if (value === "")
                body[field] = null;
            else {
                const dollars = Number(value);
                body[field] = Number.isFinite(dollars) ? Math.round(dollars * 100) : value;
            }
        }
        else if (dateFields.has(field)) {
            const iso = centralDateTimeInputToIso(typeof value === "string" ? value : null);
            if (value && !iso) {
                setSaving(false);
                setMessage("Enter a valid Central Time. Times skipped by daylight-saving changes are not valid.");
                return;
            }
            body[field] = iso;
        }
        else if (nullableBooleanFields.has(field))
            body[field] = value === "inherit" ? null : value === "true";
        else
            body[field] = value;
    } body.expectedUpdatedAt = editing.updatedAt; const response = await fetch(`/api/admin/pricing/${editing.kind}/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})); setSaving(false); if (!response.ok) {
        setMessage(payload.error ?? "Pricing update failed.");
        return;
    } setItems(current => current.map(item => item.kind === payload.item.kind && item.id === payload.item.id ? payload.item : item)); closeEditor(); const checkoutMessage = typeof payload.item.checkoutPriceCents === "number" ? ` Checkout price: ${money(payload.item.checkoutPriceCents)}.` : ""; setMessage(payload.item.effectivePriceCents === null ? `Saved. ${payload.item.effectiveExplanation ?? "This amount is not currently customer-facing."}` : `Saved. Customer price is now ${money(payload.item.effectivePriceCents)}. Source: ${payload.item.effectiveSourceLabel ?? payload.item.storedAtLabel}.${checkoutMessage}`); }
    const brands = useMemo(() => {
        const available = [...new Set(items.filter(item => equipmentKinds.has(item.kind)).map(item => item.brand).filter(Boolean) as string[])];
        return available.sort((a, b) => {
            const aIndex = preferredBrands.indexOf(a); const bIndex = preferredBrands.indexOf(b);
            if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
            return a.localeCompare(b);
        });
    }, [items]);
    const filtered = useMemo(() => items.filter(item => {
        const query = search.trim().toLowerCase();
        const matchesSearch = !query || [item.name, item.slug, item.sku, item.brand, item.productName, item.targetLabel].some(value => value?.toLowerCase().includes(query));
        const matchesWorkspace = view === "manual" ? equipmentKinds.has(item.kind) && (brand === "all" || item.brand === brand) : view === "services" ? serviceKinds.has(item.kind) : view === "schedules" ? item.kind === "schedules" : false;
        const matchesKind = kind === "all" || item.kind === kind || kind === "sale" && item.saleState === "active" || kind === "upcoming" && item.saleState === "upcoming" || kind === "unavailable" && !item.isAvailable || kind === "contact" && (item.effectiveSource === "contact_for_pricing" || item.quoteOnly);
        return matchesSearch && matchesWorkspace && matchesKind;
    }), [items, search, kind, brand, view]);
    if (authed === null)
        return <main className="min-h-screen bg-slate-100 p-6">Loading admin…</main>;
    if (!authed)
        return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6"><form onSubmit={login} className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl"><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="mt-2 text-3xl font-black">Pricing Management</h1><p className="mt-3 text-slate-600">Use the existing IDS administrator password.</p><label className="mt-6 block font-bold">Admin password<input type="password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3"/></label><button className="mt-5 w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign In</button>{message && <p role="alert" className="mt-4 text-red-700">{message}</p>}</form></main>;
    const proposed = editing ? proposedCustomerPrice(editing, draft) : null;
    const activeSales = items.filter(item => item.saleState === "active").length;
    const upcomingSales = items.filter(item => item.saleState === "upcoming").length;
    const contactPrices = items.filter(item => item.effectiveSource === "contact_for_pricing" || item.quoteOnly).length;
    const selectWorkspace = (nextView: PricingView, nextBrand = "all") => {
        setView(nextView); setBrand(nextBrand); setSearch(""); setKind("all"); setMenuOpen(false); menuButtonRef.current?.focus();
    };
    return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-5 md:p-10"><div className="mx-auto max-w-7xl"><header className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><button ref={menuButtonRef} type="button" aria-label="Open pricing menu" aria-expanded={menuOpen} aria-controls="pricing-menu" onClick={() => setMenuOpen(true)} className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-slate-300 bg-white text-2xl font-black shadow-sm">☰</button><div><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="text-3xl font-black sm:text-4xl">Pricing Management</h1><p className="mt-1 text-sm font-semibold text-slate-600">{view === "manual" ? `Manual Price Changes${brand !== "all" ? ` / ${brand}` : ""}` : view === "services" ? "Services & Deployment" : view === "imports" ? "Manufacturer Price Sheets" : view === "schedules" ? "Sales / Price Schedules" : view === "program" ? "Pricing Program Settings" : "Overview"}</p></div></div><button onClick={async () => { await fetch("/api/admin/reviews/login", { method: "DELETE" }); setAuthed(false); }} className="rounded-xl border px-4 py-2 font-bold">Sign Out</button></header>
  {menuOpen && <div className="fixed inset-0 z-[60] bg-slate-950/60" onMouseDown={event => { if (event.target === event.currentTarget) { setMenuOpen(false); menuButtonRef.current?.focus(); } }}><aside id="pricing-menu" aria-label="Pricing menu" className="h-full w-[min(88vw,22rem)] overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Pricing Menu</h2><button type="button" aria-label="Close pricing menu" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }} className="min-h-11 rounded-xl border px-4 font-black">Close</button></div><nav className="mt-5 space-y-2"><button ref={firstMenuItemRef} type="button" aria-current={view === "overview" ? "page" : undefined} onClick={() => selectWorkspace("overview")} className={`w-full rounded-xl px-4 py-3 text-left font-black ${view === "overview" ? "bg-slate-950 text-white" : "bg-slate-100"}`}>Overview</button><div className="rounded-2xl border border-slate-200 p-2"><button type="button" aria-current={view === "manual" && brand === "all" ? "page" : undefined} onClick={() => selectWorkspace("manual")} className="w-full rounded-xl px-3 py-2 text-left font-black">Manual Price Changes</button><div className="mt-1 space-y-1 border-l-2 border-slate-200 pl-3">{brands.map(value => <button key={value} type="button" aria-current={view === "manual" && brand === value ? "page" : undefined} onClick={() => selectWorkspace("manual", value)} className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left font-bold ${view === "manual" && brand === value ? "bg-emerald-100 text-emerald-950 ring-2 ring-emerald-700" : "hover:bg-slate-100"}`}>{value}</button>)}</div></div>{(["services", "imports", "schedules", "program"] as PricingView[]).map((value) => <button key={value} type="button" aria-current={view === value ? "page" : undefined} onClick={() => selectWorkspace(value)} className={`w-full rounded-xl px-4 py-3 text-left font-black ${view === value ? "bg-slate-950 text-white" : "bg-slate-100"}`}>{value === "services" ? "Services & Deployment" : value === "imports" ? "Manufacturer Price Sheets" : value === "schedules" ? "Sales / Price Schedules" : "Pricing Program Settings"}</button>)}</nav></aside></div>}

  {view === "overview" && <section className="mt-7 space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">Active sales</p><p className="mt-1 text-3xl font-black">{activeSales}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">Upcoming sales</p><p className="mt-1 text-3xl font-black">{upcomingSales}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">Contact / quote only</p><p className="mt-1 text-3xl font-black">{contactPrices}</p></div><div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">Catalog records</p><p className="mt-1 text-3xl font-black">{items.length}</p></div></div><div className="rounded-3xl bg-white p-5 shadow-sm"><h2 className="text-2xl font-black">Quick actions</h2><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => selectWorkspace("manual", brands[0] ?? "all")} className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white">Manual Price Changes</button><button type="button" onClick={() => selectWorkspace("imports")} className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Upload Price Sheet</button><button type="button" onClick={() => { selectWorkspace("manual"); setKind("sale"); }} className="rounded-xl border border-slate-300 px-5 py-3 font-black">View Active Sales</button></div><p className="mt-5 max-w-3xl text-sm leading-6 text-slate-600">Customer price precedence: an active price schedule selects the pricing row, then an active temporary sale wins; otherwise the pricing program selects IDS Everyday Low Price or Manufacturer MSRP. Quote-only and Contact for Pricing suppress self-service pricing.</p></div></section>}

  {view === "program" && <><PricingProgramToggle onChanged={load} />
  <div className="mt-7 rounded-2xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-950">Active Temporary Sale Price always takes priority. When the program is on, IDS Everyday Low Price follows; when off, Manufacturer MSRP is used where available.</div></>}
  {view === "manual" && brand === "Yarbo" && <PackageCorePricing />}

  {view === "imports" && <section className="mt-6 rounded-3xl border-2 border-blue-300 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-black uppercase tracking-[.18em] text-blue-700">
          Manufacturer Price Sheet
        </p>
        <h2 className="mt-1 text-2xl font-black">
          Upload Price Sheet
        </h2>
        <p className="mt-2 max-w-3xl font-semibold text-slate-600">
          Upload an XLSX, XLS, or CSV manufacturer price sheet. IDS will parse it and prepare a review preview before any pricing can be applied.
        </p>
      </div>

      <span className="rounded-full bg-amber-100 px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-950">
        Preview Only — No Live Changes
      </span>
    </div>

    <form
      onSubmit={uploadSaleImport}
      className="mt-5 grid gap-4 md:grid-cols-[minmax(12rem,.7fr)_minmax(16rem,1.3fr)_auto]"
    >
      <label className="font-bold">
        Manufacturer
        <select
          required
          value={saleImportBrand}
          onChange={event => setSaleImportBrand(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3"
        >
          <option value="">Choose manufacturer</option>
          {saleImportBrands.map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="font-bold">
        Price Sheet
        <input
          type="file"
          required
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          onChange={event =>
            setSaleImportFile(event.target.files?.[0] ?? null)
          }
          className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3"
        />
      </label>

      <div className="flex items-end">
        <button
          type="submit"
          disabled={
            saleImportLoading ||
            !saleImportBrand ||
            !saleImportFile
          }
          className="w-full rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
        >
          {saleImportLoading
            ? "Parsing..."
            : "Upload & Preview"}
        </button>
      </div>
    </form>

    <p className="mt-3 text-sm font-semibold text-slate-500">
      Maximum file size: 4 MB. The original spreadsheet is stored privately for IDS administrative review.
    </p>

    {saleImportMessage && (
      <p
        role="status"
        className="mt-4 rounded-xl bg-slate-100 p-4 font-bold"
      >
        {saleImportMessage}
      </p>
    )}

    {saleImportPreview && (
      <div className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="text-xs font-black uppercase text-slate-500">
              Parsed Rows
            </p>
            <p className="mt-1 text-2xl font-black">
              {saleImportPreview.parsedRowCount}
            </p>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-xs font-black uppercase text-emerald-700">
              Matched
            </p>
            <p className="mt-1 text-2xl font-black">
              {saleImportPreview.safeMatchCount}
            </p>
          </div>

          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-xs font-black uppercase text-amber-800">
              Needs Review
            </p>
            <p className="mt-1 text-2xl font-black">
              {saleImportPreview.needsReviewCount}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 p-4">
            <p className="text-xs font-black uppercase text-slate-500">
              Skipped
            </p>
            <p className="mt-1 text-2xl font-black">
              {saleImportPreview.skippedCount}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-black uppercase text-blue-800">Detected Source</dt>
            <dd className="mt-1 font-semibold">{saleImportPreview.detectedManufacturerBrand ?? "Not detected"} · {saleImportPreview.pricingScope.toUpperCase()}</dd>
          </div>
          <div>
            <dt className="font-black uppercase text-blue-800">Promotion</dt>
            <dd className="mt-1 font-semibold">{saleImportPreview.promotionLabel ?? "Not detected"}</dd>
          </div>
          <div>
            <dt className="font-black uppercase text-blue-800">Sale Window (Central)</dt>
            <dd className="mt-1 font-semibold">{dateTimeLabel(saleImportPreview.promotionStartsAt)} to {dateTimeLabel(saleImportPreview.promotionEndsAt)} (exclusive end)</dd>
          </div>
          <div>
            <dt className="font-black uppercase text-blue-800">Header Evidence</dt>
            <dd className="mt-1 font-semibold">{saleImportPreview.headerSheetName} · row {saleImportPreview.headerRowNumber}</dd>
          </div>
        </dl>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="p-3">Row</th>
                <th className="p-3">Manufacturer Item</th>
                <th className="p-3">IDS Match</th>
                <th className="p-3">Current → Proposed MSRP</th>
                <th className="p-3">Current → Proposed Sale</th>
                <th className="p-3">Discount</th>
                <th className="bg-slate-800 p-3">🔒 Promo Dealer Cost</th>
                <th className="p-3">Match Evidence</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>

            <tbody>
              {saleImportPreview.rows.map(row => (
                <tr
                  key={`${row.sheetName}:${row.rowNumber}`}
                  className="border-t border-slate-200"
                >
                  <td className="whitespace-nowrap p-3 font-bold">
                    {row.sheetName} · {row.rowNumber}
                  </td>

                  <td className="p-3">
                    <div className="font-bold">
                      {row.itemName ?? "Unnamed row"}
                    </div>
                    {row.sku && (
                      <div className="text-xs text-slate-500">
                        SKU: {row.sku}
                      </div>
                    )}
                  </td>

                  <td className="p-3">
                    <div className="font-bold">{row.matchedLabel ?? "Not matched"}</div>
                    {row.targetStatus && <div className="mt-1 text-xs uppercase text-slate-500">Catalog: {row.targetStatus.replaceAll("_", " ")}</div>}
                  </td>

                  <td className="whitespace-nowrap p-3">
                    {money(row.currentMsrpCents)} → <strong>{money(row.proposedMsrpCents)}</strong>
                  </td>

                  <td className="whitespace-nowrap p-3">
                    {money(row.currentSaleCents)} → <strong>{money(row.proposedSaleCents)}</strong>
                  </td>

                  <td className="whitespace-nowrap p-3">
                    {money(row.proposedDiscountCents)}
                  </td>

                  <td className="whitespace-nowrap bg-slate-50 p-3 font-black">
                    {money(row.proposedDealerCostCents)}
                  </td>

                  <td className="max-w-xs p-3">
                    <div className="font-bold">{row.matchMethod?.replaceAll("_", " ") ?? "No deterministic match"}</div>
                    {row.matchReason && <div className="mt-1 text-xs text-slate-600">{row.matchReason}</div>}
                    {row.validationErrors.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs font-bold text-red-700">
                        {row.validationErrors.map(error => <li key={error}>{error}</li>)}
                      </ul>
                    )}
                  </td>

                  <td className="p-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black uppercase ${
                        row.matchStatus === "matched"
                          ? "bg-emerald-100 text-emerald-900"
                          : row.matchStatus === "needs_review"
                            ? "bg-amber-100 text-amber-950"
                            : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {row.matchStatus.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {saleImportPreview.previewLimited && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">
            This screen shows the first 250 rows only. The complete import is retained privately for review.
          </p>
        )}

        <p className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 font-black text-amber-950">
          Nothing shown in this preview has changed the public storefront, checkout pricing, IDS Everyday Price, dealer cost, or Temporary Sale Price.
        </p>
      </div>
    )}

    {saleImportHistory.length > 0 && (
      <div className="mt-6 rounded-2xl border-2 border-slate-300 bg-slate-50 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[18rem] flex-1 font-bold">
            Review Imported Price Sheet
            <select
              value={saleImportReviewId}
              onChange={event => {
                setSaleImportReviewId(event.target.value);
                setSaleImportReview(null);
              }}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3"
            >
              <option value="">Choose an import</option>

              {saleImportHistory.map(item => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.manufacturer_brand} — {item.original_file_name} — {new Date(item.created_at).toLocaleString()}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={
              !saleImportReviewId ||
              saleImportReviewLoading
            }
            onClick={() => void openSaleImportReview(saleImportReviewId)}
            className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50"
          >
            {saleImportReviewLoading
              ? "Loading Review..."
              : "Open Review"}
          </button>
        </div>
      </div>
    )}

    {saleImportReview && (
      <section className="mt-6 rounded-3xl border-2 border-emerald-300 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[.16em] text-emerald-700">
              Import Review
            </p>

            <h3 className="mt-1 text-2xl font-black">
              {saleImportReview.import.manufacturer_brand}
            </h3>

            <p className="mt-1 font-semibold text-slate-600">
              {saleImportReview.import.original_file_name}
            </p>
          </div>

          <span className="rounded-full bg-amber-100 px-4 py-2 text-xs font-black uppercase text-amber-950">
            Approval Does Not Apply Prices
          </span>
        </div>

        <dl className="mt-4 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-black uppercase text-emerald-800">Detected Source</dt>
            <dd className="mt-1 font-semibold">{saleImportReview.import.detected_manufacturer_brand ?? "Not detected"} · {(saleImportReview.import.pricing_scope ?? "generic").toUpperCase()}</dd>
          </div>
          <div>
            <dt className="font-black uppercase text-emerald-800">Promotion</dt>
            <dd className="mt-1 font-semibold">{saleImportReview.import.promotion_label ?? "Not detected"}</dd>
          </div>
          <div>
            <dt className="font-black uppercase text-emerald-800">Sale Window (Central)</dt>
            <dd className="mt-1 font-semibold">{dateTimeLabel(saleImportReview.import.promotion_starts_at)} to {dateTimeLabel(saleImportReview.import.promotion_ends_at)} (exclusive end)</dd>
          </div>
          <div>
            <dt className="font-black uppercase text-emerald-800">Header Evidence</dt>
            <dd className="mt-1 font-semibold">{saleImportReview.import.header_sheet_name ?? "Unknown sheet"} · row {saleImportReview.import.header_row_number ?? "?"}</dd>
          </div>
        </dl>

        <p className="mt-4 rounded-xl bg-blue-50 p-4 font-bold text-blue-950">
          Review the IDS match and source validation for each row, correct it if necessary, then approve only the rows you trust. Approval alone does not affect live pricing; the separate Apply Approved Rows action is required.
        </p>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[1550px] w-full text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="p-3">Row</th>
                <th className="p-3">Manufacturer Item</th>
                <th className="p-3">IDS Match</th>
                <th className="p-3">Current → Proposed MSRP</th>
                <th className="p-3">Current → Proposed Sale</th>
                <th className="p-3">Discount</th>
                <th className="p-3">Promotion</th>
                <th className="bg-slate-800 p-3">🔒 Promo Dealer Cost</th>
                <th className="p-3">Match Evidence</th>
                <th className="p-3">Approve</th>
              </tr>
            </thead>

            <tbody>
              {saleImportReview.rows.map(row => {
                const selectedTarget =
                  row.matchedKind && row.matchedId
                    ? `${row.matchedKind}:${row.matchedId}`
                    : "";

                const rowBusy =
                  saleImportRowSaving === row.id;

                return (
                  <tr
                    key={row.id}
                    className="border-t border-slate-200 align-top"
                  >
                    <td className="whitespace-nowrap p-3 font-bold">
                      {row.sheetName ?? "Sheet"} · {row.rowNumber ?? "?"}
                    </td>

                    <td className="p-3">
                      <div className="font-black">
                        {row.itemName ?? "Unnamed row"}
                      </div>

                      {row.sku && (
                        <div className="mt-1 text-xs text-slate-500">
                          SKU: {row.sku}
                        </div>
                      )}

                      <div className="mt-2 text-xs font-bold uppercase text-slate-500">
                        {row.matchStatus.replaceAll("_", " ")}
                      </div>
                    </td>

                    <td className="min-w-[20rem] p-3">
                      <select
                        value={selectedTarget}
                        disabled={
                          rowBusy ||
                          row.matchStatus === "applied"
                        }
                        onChange={event => {
                          const value = event.target.value;

                          if (!value) {
                            void updateSaleImportReviewRow(
                              row.id,
                              {
                                targetKind: null,
                                targetId: null,
                              },
                            );

                            return;
                          }

                          const separator = value.indexOf(":");

                          const targetKind = value.slice(
                            0,
                            separator,
                          ) as "product" | "variant" | "option" | "package";

                          const targetId = value.slice(
                            separator + 1,
                          );

                          void updateSaleImportReviewRow(
                            row.id,
                            {
                              targetKind,
                              targetId,
                            },
                          );
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white p-2"
                      >
                        <option value="">
                          Needs manual match
                        </option>

                        {saleImportReview.candidates.map(candidate => (
                          <option
                            key={`${candidate.kind}:${candidate.id}`}
                            value={`${candidate.kind}:${candidate.id}`}
                          >
                            {candidate.kind.toUpperCase()} — {candidate.label}
                          </option>
                        ))}
                      </select>

                      {row.matchConfidence === 1 && (
                        <p className="mt-1 text-xs font-bold text-emerald-700">
                          Deterministic automatic match
                        </p>
                      )}

                      {row.suggestions.length > 0 && (
                        <p className="mt-2 text-xs text-amber-800">
                          Suggestions only: {row.suggestions.map(item => item.label).join(", ")}
                        </p>
                      )}
                    </td>

                  <td className="whitespace-nowrap p-3">
                      {money(row.currentMsrpCents)} → <strong>{money(row.proposedMsrpCents)}</strong>
                    </td>

                    <td className="whitespace-nowrap p-3">
                      {money(row.currentSaleCents)} → <strong>{money(row.proposedSaleCents)}</strong>
                    </td>

                    <td className="whitespace-nowrap p-3">
                      {money(row.proposedDiscountCents)}
                    </td>

                    <td className="min-w-[14rem] p-3">
                      <div className="font-bold">{row.proposedPromotionLabel ?? "Not detected"}</div>
                      <div className="mt-1 text-xs text-slate-600">{dateTimeLabel(row.proposedSaleStartsAt)} to {dateTimeLabel(row.proposedSaleEndsAt)}</div>
                    </td>

                    <td className="whitespace-nowrap bg-slate-50 p-3 font-black">
                      {money(row.proposedDealerCostCents)}
                    </td>

                    <td className="max-w-sm p-3">
                      <div className="font-bold">{row.matchMethod?.replaceAll("_", " ") ?? "Manual review"}</div>
                      {row.matchReason && <div className="mt-1 text-xs text-slate-600">{row.matchReason}</div>}
                      {row.validationErrors.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs font-bold text-red-700">
                          {row.validationErrors.map(error => <li key={error}>{error}</li>)}
                        </ul>
                      )}
                    </td>

                    <td className="p-3">
                      <label className="flex items-center gap-2 font-black">
                        <input
                          type="checkbox"
                          checked={row.approved}
                          disabled={
                            rowBusy ||
                            row.matchStatus !== "matched"
                          }
                          onChange={event =>
                            void updateSaleImportReviewRow(
                              row.id,
                              {
                                approved: event.target.checked,
                              },
                            )
                          }
                          className="h-5 w-5 accent-emerald-600"
                        />

                        {rowBusy
                          ? "Saving..."
                          : row.approved
                            ? "Approved"
                            : "Not Approved"}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-2xl border-2 border-red-300 bg-red-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[.16em] text-red-700">
                Live Pricing Action
              </p>

              <h4 className="mt-1 text-xl font-black text-red-950">
                Apply Approved Rows
              </h4>

              <p className="mt-2 max-w-3xl font-semibold text-red-900">
                Only rows marked Approved will be applied. IDS Everyday Low Price is protected and will not be overwritten by this import.
              </p>
            </div>

            <button
              type="button"
              disabled={
                saleImportApplying ||
                saleImportReview.rows.filter(
                  row =>
                    row.approved &&
                    row.matchStatus === "matched",
                ).length === 0
              }
              onClick={() => void applySaleImportReview()}
              className="rounded-xl bg-red-700 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saleImportApplying
                ? "Applying..."
                : `Apply ${
                    saleImportReview.rows.filter(
                      row =>
                        row.approved &&
                        row.matchStatus === "matched",
                    ).length
                  } Approved Row${
                    saleImportReview.rows.filter(
                      row =>
                        row.approved &&
                        row.matchStatus === "matched",
                    ).length === 1
                      ? ""
                      : "s"
                  }`}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-3">
            <div className="text-xs font-black uppercase text-emerald-700">
              Approved
            </div>
            <div className="mt-1 text-2xl font-black">
              {saleImportReview.rows.filter(row => row.approved).length}
            </div>
          </div>

          <div className="rounded-xl bg-amber-50 p-3">
            <div className="text-xs font-black uppercase text-amber-800">
              Needs Review
            </div>
            <div className="mt-1 text-2xl font-black">
              {saleImportReview.rows.filter(row => row.matchStatus === "needs_review").length}
            </div>
          </div>

          <div className="rounded-xl bg-slate-100 p-3">
            <div className="text-xs font-black uppercase text-slate-600">
              Total Rows
            </div>
            <div className="mt-1 text-2xl font-black">
              {saleImportReview.rows.length}
            </div>
          </div>
        </div>
      </section>
    )}
    {saleImportHistory.length > 0 && (
      <details className="mt-6 rounded-2xl border border-slate-200 p-4">
        <summary className="cursor-pointer font-black">
          Recent Price Sheet Imports ({saleImportHistory.length})
        </summary>

        <div className="mt-4 space-y-3">
          {saleImportHistory.slice(0, 10).map(item => (
            <div
              key={item.id}
              className="rounded-xl bg-slate-50 p-3 text-sm"
            >
              <div className="font-black">
                {item.manufacturer_brand} — {item.original_file_name}
              </div>

              <div className="mt-1 text-slate-600">
                {new Date(item.created_at).toLocaleString()} ·
                {" "}{item.parsed_row_count} rows ·
                {" "}{item.safe_match_count} matched ·
                {" "}{item.needs_review_count} review ·
                {" "}Status: {item.status.replaceAll("_", " ")}
              </div>
            </div>
          ))}
        </div>
      </details>
    )}
  </section>}
  {(view === "manual" || view === "services" || view === "schedules") && <section aria-labelledby="pricing-workspace-title"><div className="mt-6 grid min-w-0 gap-4 rounded-2xl bg-white p-5 md:grid-cols-3"><label className="min-w-0 font-bold md:col-span-2">Search<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, slug, SKU, package, module, or option" className="mt-2 min-w-0 w-full rounded-xl border p-3"/></label><label className="min-w-0 font-bold">Filter<select value={kind} onChange={event => setKind(event.target.value)} className="mt-2 min-w-0 w-full rounded-xl border bg-white p-3"><option value="all">All</option>{view === "manual" && <><option value="products">Machines</option><option value="variants">Models / Configurations</option><option value="packages">Packages</option><option value="options">Modules / Accessories</option></>}{view === "services" && <><option value="services">Services</option><option value="service-payment-options">Payment Options</option><option value="product-services">Product Overrides</option></>}<option value="sale">On Sale</option><option value="upcoming">Upcoming Sale</option><option value="unavailable">Unavailable</option><option value="contact">Contact / Quote</option></select></label>{view === "manual" && <div className="min-w-0 md:col-span-3"><p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Brand</p><div className="flex max-w-full gap-2 overflow-x-auto pb-1"><button type="button" aria-pressed={brand === "all"} onClick={() => setBrand("all")} className={`shrink-0 rounded-xl px-4 py-2 font-black ${brand === "all" ? "bg-slate-950 text-white" : "border bg-white"}`}>All brands</button>{brands.map(value => <button key={value} type="button" aria-pressed={brand === value} onClick={() => setBrand(value)} className={`shrink-0 rounded-xl px-4 py-2 font-black ${brand === value ? "bg-emerald-700 text-white" : "border bg-white"}`}>{value}</button>)}</div></div>}</div>
  {message && <p role="status" className="mt-5 rounded-xl bg-white p-4 font-bold">{message}</p>}
  <p id="pricing-workspace-title" className="mt-6 font-bold">{filtered.length} pricing records</p>
  <div className="mt-4 grid gap-4 lg:grid-cols-2">{filtered.map(item => (
    <article key={`${item.kind}:${item.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">{item.category}</p><h2 className="mt-1 text-xl font-black">{item.name}</h2><p className="text-sm text-slate-500">{[item.slug, item.sku, item.brand, item.productName].filter(Boolean).join(" · ")}</p>{item.targetLabel && <p className="mt-1 text-sm font-bold">Target: {item.targetLabel}</p>}</div><button onClick={() => edit(item)} className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 font-black text-white">Edit</button></div>
      <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3"><div><p className="text-xs font-black uppercase text-slate-500">Current customer price</p><p className="mt-1 text-xl font-black">{money(item.effectivePriceCents)}</p></div><div><p className="text-xs font-black uppercase text-slate-500">Price source</p><p className="mt-1 font-black">{item.effectiveSourceLabel ?? item.storedAtLabel ?? item.category}</p></div><div><p className="text-xs font-black uppercase text-slate-500">Sale state</p><p className="mt-1 font-black">{item.saleState === "active" ? "ACTIVE" : (item.saleState ?? "none").replaceAll("_", " ")}</p></div></div>
      <p className="mt-3 text-sm font-semibold text-slate-700"><span className="font-black">Stored at:</span> {item.storedAtLabel ?? item.category}</p><p className="mt-1 text-sm text-slate-600">{item.effectiveExplanation}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3"><span className="mr-1 text-xs font-black uppercase tracking-[.16em] text-slate-700">Available</span><button type="button" aria-pressed={item.availabilityStatus === "active"} disabled={Boolean(availabilitySavingKey)} onClick={() => void setAvailability(item, "active")} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-black ${item.availabilityStatus === "active" ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700"} disabled:cursor-wait disabled:opacity-60`}>ON</button><button type="button" aria-pressed={item.availabilityStatus === "unavailable"} disabled={Boolean(availabilitySavingKey)} onClick={() => void setAvailability(item, "unavailable")} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-black ${item.availabilityStatus === "unavailable" ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700"} disabled:cursor-wait disabled:opacity-60`}>OFF</button>{item.availabilityField === "public_status" && <button type="button" aria-pressed={item.availabilityStatus === "hidden"} disabled={Boolean(availabilitySavingKey)} onClick={() => void setAvailability(item, "hidden")} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-black ${item.availabilityStatus === "hidden" ? "bg-red-700 text-white" : "border border-red-300 bg-white text-red-700"} disabled:cursor-wait disabled:opacity-60`}>HIDDEN</button>}<span className={`ml-auto rounded-full px-3 py-1 text-xs font-black uppercase ${item.availabilityStatus === "hidden" ? "bg-red-100 text-red-900" : item.isAvailable ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{availabilitySavingKey === `${item.kind}:${item.id}` ? "SAVING…" : item.availabilityStatus === "active" ? "AVAILABLE" : item.availabilityStatus === "unavailable" ? "UNAVAILABLE" : item.availabilityStatus.replaceAll("_", " ")}</span></div>
      <PricingFacts item={item}/>
    </article>
  ))}</div></section>}
  {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget && !saving) closeEditor(); }}><div role="dialog" aria-modal="true" aria-labelledby="pricing-edit-heading" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-8"><div className="flex justify-between gap-4"><div><p className="text-sm font-bold uppercase text-emerald-700">{editing.category}</p><h2 id="pricing-edit-heading" className="text-2xl font-black">Edit {editing.name}</h2><p className="mt-1 text-sm font-semibold text-slate-600">Stored at: {editing.storedAtLabel ?? editing.category}</p></div><button type="button" autoFocus onClick={closeEditor} className="h-fit min-h-11 rounded-xl border px-3 py-2 font-bold">Close</button></div>
    {editing.activeScheduleName && <div className="mt-4 rounded-xl border-2 border-blue-300 bg-blue-50 p-4 font-bold text-blue-950">Customer pricing is currently controlled by active schedule: {editing.activeScheduleName}. <button type="button" onClick={() => { closeEditor(); selectWorkspace("schedules"); }} className="underline">Inspect schedules</button></div>}
    {editing.kind === "product-services" && <p className="mt-4 rounded-xl bg-blue-50 p-3 font-bold text-blue-900">Blank = inherit base service pricing</p>}{editing.quoteOnly && <p className="mt-4 rounded-xl bg-amber-50 p-3 font-bold text-amber-950">Quote-only — stored catalog amounts are not displayed as customer checkout pricing.</p>}
    <p className="mt-4 text-sm font-semibold text-slate-700">Manufacturer / Comparison Price is display-only and is never charged while the IDS Everyday Low Price Program is on.</p>
    <div className="mt-5 grid gap-3 rounded-2xl bg-slate-100 p-4 sm:grid-cols-2"><div><p className="text-xs font-black uppercase text-slate-600">Current customer price</p><p className="text-2xl font-black">{money(editing.effectivePriceCents)}</p><p className="mt-1 text-sm">{editing.effectiveSourceLabel}</p></div><div><p className="text-xs font-black uppercase text-slate-600">Proposed customer price</p><p className="text-2xl font-black">{money(proposed?.price ?? null)}</p><p className="mt-1 text-sm">{proposed?.reason}</p></div></div>
    <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">{editablePricingFields[editing.kind].map(field => <label key={field} className="font-bold">{fieldLabel(editing.kind, field)}{priceFields.has(field) ? <input type="number" min="0" step="0.01" value={String(draft[field] ?? "")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} placeholder="2799.00" className="mt-2 w-full rounded-xl border p-3"/> : dateFields.has(field) ? <><input type="datetime-local" required={editing.kind === "schedules" && field === "starts_at"} value={String(draft[field] ?? "")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border p-3"/><span className="mt-1 block text-xs font-medium text-slate-600">Central Time{field.includes("end") ? " — the window stops at this exact time." : ""}</span></> : booleanFields.has(field) ? <input type="checkbox" checked={Boolean(draft[field])} onChange={event => setDraft(current => ({ ...current, [field]: event.target.checked }))} className="ml-3 h-5 w-5 accent-emerald-600"/> : nullableBooleanFields.has(field) ? <select value={String(draft[field] ?? "inherit")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="inherit">Blank — inherit</option><option value="true">Yes</option><option value="false">No</option></select> : field === "public_status" ? <select value={String(draft[field] ?? "hidden")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border bg-white p-3">{["active", "unavailable", "coming_soon", "hidden"].map(value => <option key={value}>{value}</option>)}</select> : <input maxLength={160} required={field === "schedule_name"} value={String(draft[field] ?? "")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border p-3"/>}</label>)}<div className="sm:col-span-2"><p className="mb-4 rounded-xl bg-amber-50 p-3 font-bold text-amber-950">Price order: active schedule row → active temporary sale → IDS Everyday Price (program ON) or Manufacturer MSRP (program OFF).</p><button disabled={saving} className="w-full rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-60 sm:w-auto">{saving ? "Saving…" : "Save Pricing"}</button></div></form><PricingPromotionEditor
    key={`${editing.kind}:${editing.id}`}
    item={editing}
    onSaved={(updated, label) => {
        setItems(current =>
            current.map(item =>
                item.kind === updated.kind && item.id === updated.id
                    ? updated
                    : item,
            ),
        );
        setEditing(updated);
        setMessage(`${updated.name} ${label} saved successfully.`);
    }}
/></div></div>}</div></main>;
}
