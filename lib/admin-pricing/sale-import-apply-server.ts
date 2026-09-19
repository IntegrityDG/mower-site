import "server-only";

import {
  getSupabaseServiceClient,
} from "@/lib/supabase";

import {
  readSaleImportReview,
  SaleImportError,
} from "@/lib/admin-pricing/sale-import-server";

import {
  assertSaleImportApplyPolicy,
  saleImportAppliedValues,
  saleImportBeforeValues,
  SaleImportApplyPolicyError,
  saleImportPricingUpdate,
  type SaleImportApplyProposal,
} from "@/lib/admin-pricing/sale-import-apply-policy";


type ApplyKind =
  | "product"
  | "variant"
  | "option"
  | "package";


const TARGET_TABLES: Record<
  ApplyKind,
  string
> = {
  product:
    "catalog_products",

  variant:
    "catalog_product_variants",

  option:
    "catalog_options",

  package:
    "catalog_packages",
};


const PRIVATE_TARGET_COLUMNS: Record<
  ApplyKind,
  string
> = {
  product:
    "product_id",

  variant:
    "variant_id",

  option:
    "option_id",

  package:
    "package_id",
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


function numberOrNull(
  value: unknown,
) {
  return typeof value ===
    "number"
    ? value
    : null;
}


function stringOrNull(
  value: unknown,
) {
  return typeof value ===
    "string"
    ? value
    : null;
}


function storedTarget(
  row: Record<string, unknown>,
): {
  kind: ApplyKind;
  id: string;
} | null {
  const mappings = [
    [
      "product_id",
      "product",
    ],
    [
      "variant_id",
      "variant",
    ],
    [
      "option_id",
      "option",
    ],
    [
      "package_id",
      "package",
    ],
  ] as const;

  const matches =
    mappings
      .filter(
        ([column]) =>
          Boolean(row[column]),
      )
      .map(
        ([column, kind]) => ({
          kind,
          id: String(
            row[column],
          ),
        }),
      );

  return matches.length === 1
    ? matches[0]
    : null;
}


export async function applyApprovedSaleImport(
  importId: string,
) {
  assertUuid(
    importId,
    "Import ID",
  );

  const review =
    await readSaleImportReview(
      importId,
    );

  if (
    review.import.status ===
    "applied"
  ) {
    throw new SaleImportError(
      409,
      "This price-sheet import has already been fully applied.",
    );
  }

  const approvedPending =
    review.rows.filter(
      row =>
        row.approved &&
        row.matchStatus ===
          "matched",
    );

  if (
    !approvedPending.length
  ) {
    throw new SaleImportError(
      400,
      "Approve at least one matched row before applying pricing.",
    );
  }

  const client =
    getSupabaseServiceClient();

  const privateClient =
    client.schema(
      "catalog_private",
    );

  const approvedIds =
    approvedPending.map(
      row => row.id,
    );

  const {
    data: storedRows,
    error: storedRowsError,
  } = await privateClient
    .from(
      "catalog_sale_import_rows",
    )
    .select(
      "id,import_id,product_id,variant_id,option_id,package_id,match_status,match_method,validation_errors,approved,proposed_display_msrp_price_cents,proposed_sale_price_cents,proposed_discount_cents,proposed_sale_starts_at,proposed_sale_ends_at,proposed_promotional_dealer_cost_cents,proposed_promotion_label,proposed_sale_message,proposed_show_sale_message_public,before_values,applied_values,applied_at",
    )
    .eq(
      "import_id",
      importId,
    )
    .in(
      "id",
      approvedIds,
    );

  if (
    storedRowsError
  ) {
    throw storedRowsError;
  }

  const candidatesByKey =
    new Map(
      review.candidates.map(
        candidate => [
          `${candidate.kind}:${candidate.id}`,
          candidate,
        ],
      ),
    );

  const previouslyApplied =
    review.rows.filter(
      row =>
        row.matchStatus ===
        "applied",
    ).length;

  let appliedThisRun = 0;

  try {
    for (
      const rawRow
      of (
        storedRows ?? []
      ) as Record<
        string,
        unknown
      >[]
    ) {
      if (
        rawRow.approved !==
          true ||
        rawRow.match_status !==
          "matched"
      ) {
        continue;
      }

      const rowId =
        String(rawRow.id);

      const target =
        storedTarget(
          rawRow,
        );

      if (!target) {
        throw new SaleImportError(
          409,
          `Approved row ${rowId} does not have exactly one IDS target.`,
        );
      }

      const currentCandidate =
        candidatesByKey.get(
          `${target.kind}:${target.id}`,
        );

      if (!currentCandidate) {
        throw new SaleImportError(
          409,
          "An approved row points to an IDS item outside the selected manufacturer.",
        );
      }

      const pricingScope =
        review.import.pricing_scope === "y40" || review.import.pricing_scope === "y40p"
          ? review.import.pricing_scope
          : "generic";

      const table =
        TARGET_TABLES[
          target.kind
        ];

      const privateTargetColumn =
        PRIVATE_TARGET_COLUMNS[
          target.kind
        ];

      const {
        data: currentPricing,
        error: currentPricingError,
      } = await client
        .from(table)
        .select(
          "display_msrp_price_cents,regular_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,promotion_label",
        )
        .eq(
          "id",
          target.id,
        )
        .maybeSingle();

      if (
        currentPricingError
      ) {
        throw currentPricingError;
      }

      if (!currentPricing) {
        throw new SaleImportError(
          409,
          "The matched IDS pricing record no longer exists.",
        );
      }

      const {
        data: currentMessage,
        error: currentMessageError,
      } = await privateClient
        .from(
          "catalog_price_messages",
        )
        .select(
          "id,message,is_public,image_path",
        )
        .eq(
          privateTargetColumn,
          target.id,
        )
        .eq(
          "price_context",
          "sale",
        )
        .limit(1)
        .maybeSingle();

      if (
        currentMessageError
      ) {
        throw currentMessageError;
      }

      const proposedMsrp =
        numberOrNull(
          rawRow.proposed_display_msrp_price_cents,
        );

      const proposedSale =
        numberOrNull(
          rawRow.proposed_sale_price_cents,
        );

      const proposedDiscount =
        numberOrNull(
          rawRow.proposed_discount_cents,
        );

      const proposedStart =
        stringOrNull(
          rawRow.proposed_sale_starts_at,
        );

      const proposedEnd =
        stringOrNull(
          rawRow.proposed_sale_ends_at,
        );

      const proposedDealerCost =
        numberOrNull(
          rawRow.proposed_promotional_dealer_cost_cents,
        );

      const proposedPromotionLabel =
        stringOrNull(
          rawRow.proposed_promotion_label,
        );

      const proposedMessage =
        stringOrNull(
          rawRow.proposed_sale_message,
        );

      const proposedMessagePublic =
        rawRow.proposed_show_sale_message_public ===
        true;

      const proposal: SaleImportApplyProposal = {
        displayMsrpCents: proposedMsrp,
        saleCents: proposedSale,
        discountCents: proposedDiscount,
        dealerCostCents: proposedDealerCost,
        startsAt: proposedStart,
        endsAt: proposedEnd,
        promotionLabel: proposedPromotionLabel,
        saleMessage: proposedMessage,
        saleMessageIsPublic: proposedMessagePublic,
      };

      try {
        assertSaleImportApplyPolicy({
          manufacturerBrand: String(review.import.manufacturer_brand),
          pricingScope,
          importPromotionLabel:
            typeof review.import.promotion_label === "string"
              ? review.import.promotion_label
              : null,
          candidate: currentCandidate,
          validationErrors: rawRow.validation_errors,
          proposal,
        });
      } catch (error) {
        if (error instanceof SaleImportApplyPolicyError) {
          throw new SaleImportError(error.status, error.message);
        }
        throw error;
      }

      const {
        data: existingCost,
        error: existingCostError,
      } = await privateClient
        .from(
          "catalog_promotional_dealer_costs",
        )
        .select(
          "id,product_id,variant_id,option_id,package_id,service_id,product_service_id,dealer_cost_cents,starts_at,ends_at,source_import_id,source_import_row_id,source_label",
        )
        .eq(
          "source_import_row_id",
          rowId,
        )
        .limit(1)
        .maybeSingle();

      if (
        existingCostError
      ) {
        throw existingCostError;
      }

      const beforeValues =
        rawRow.before_values &&
        typeof rawRow.before_values ===
          "object"
          ? rawRow.before_values
          : saleImportBeforeValues({
              currentPricing,
              currentMessage: currentMessage ?? null,
              existingPromotionalCost: existingCost ?? null,
            });

      if (
        !rawRow.before_values
      ) {
        const {
          error: beforeError,
        } = await privateClient
          .from(
            "catalog_sale_import_rows",
          )
          .update({
            before_values:
              beforeValues,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            rowId,
          )
          .eq(
            "import_id",
            importId,
          );

        if (beforeError) {
          throw beforeError;
        }
      }

      const pricingUpdate =
        saleImportPricingUpdate(
          proposal,
          new Date().toISOString(),
        );

      if (
        Object.keys(
          pricingUpdate,
        ).length
      ) {
        const {
          error: pricingError,
        } = await client
          .from(table)
          .update(
            pricingUpdate,
          )
          .eq(
            "id",
            target.id,
          );

        if (pricingError) {
          throw pricingError;
        }
      }

      if (
        proposedMessage !==
        null
      ) {
        const now =
          new Date().toISOString();

        if (
          currentMessage?.id
        ) {
          const {
            error: messageError,
          } = await privateClient
            .from(
              "catalog_price_messages",
            )
            .update({
              message:
                proposedMessage,

              is_public:
                proposedMessagePublic,

              updated_at:
                now,
            })
            .eq(
              "id",
              currentMessage.id,
            );

          if (messageError) {
            throw messageError;
          }
        } else {
          const {
            error: messageError,
          } = await privateClient
            .from(
              "catalog_price_messages",
            )
            .insert({
              [privateTargetColumn]:
                target.id,

              price_context:
                "sale",

              message:
                proposedMessage,

              is_public:
                proposedMessagePublic,

              created_at:
                now,

              updated_at:
                now,
            });

          if (messageError) {
            throw messageError;
          }
        }
      }

      if (
        proposedDealerCost !==
        null
      ) {
        const costValues = {
          [privateTargetColumn]:
            target.id,

          dealer_cost_cents:
            proposedDealerCost,

          starts_at:
            proposedStart,

          ends_at:
            proposedEnd,

          source_import_id:
            importId,

          source_import_row_id:
            rowId,

          source_label:
            `Manufacturer price sheet: ${review.import.original_file_name}`.slice(
              0,
              250,
            ),

          updated_at:
            new Date().toISOString(),
        };

        if (
          existingCost?.id
        ) {
          const {
            error: costError,
          } = await privateClient
            .from(
              "catalog_promotional_dealer_costs",
            )
            .update(
              costValues,
            )
            .eq(
              "id",
              existingCost.id,
            );

          if (costError) {
            throw costError;
          }
        } else {
          const {
            error: costError,
          } = await privateClient
            .from(
              "catalog_promotional_dealer_costs",
            )
            .insert({
              ...costValues,
              created_at:
                new Date().toISOString(),
            });

          if (costError) {
            throw costError;
          }
        }
      }

      const appliedValues =
        saleImportAppliedValues({
          target,
          importId,
          rowId,
          proposal,
        });

      const appliedAt =
        new Date().toISOString();

      const {
        error: rowAppliedError,
      } = await privateClient
        .from(
          "catalog_sale_import_rows",
        )
        .update({
          match_status:
            "applied",

          applied_values:
            appliedValues,

          applied_at:
            appliedAt,

          updated_at:
            appliedAt,
        })
        .eq(
          "id",
          rowId,
        )
        .eq(
          "import_id",
          importId,
        );

      if (
        rowAppliedError
      ) {
        throw rowAppliedError;
      }

      appliedThisRun++;
    }
  } catch (error) {
    const totalApplied =
      previouslyApplied +
      appliedThisRun;

    const failureMessage =
      error instanceof SaleImportError
        ? error.message.slice(
            0,
            1000,
          )
        : "Price-sheet application failed safely. Review server logs before retrying.";

    await privateClient
      .from(
        "catalog_sale_imports",
      )
      .update({
        status:
          totalApplied > 0
            ? "partially_applied"
            : "failed",

        applied_row_count:
          totalApplied,

        failure_message:
          failureMessage,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        importId,
      );

    throw error;
  }

  const {
    data: finalRows,
    error: finalRowsError,
  } = await privateClient
    .from(
      "catalog_sale_import_rows",
    )
    .select(
      "match_status,approved",
    )
    .eq(
      "import_id",
      importId,
    );

  if (
    finalRowsError
  ) {
    throw finalRowsError;
  }

  const totalApplied =
    (
      finalRows ?? []
    ).filter(
      row =>
        row.match_status ===
        "applied",
    ).length;

  const remainingReviewable =
    (
      finalRows ?? []
    ).some(
      row =>
        row.match_status !==
          "applied" &&
        row.match_status !==
          "skipped",
    );

  const finalStatus =
    remainingReviewable
      ? "partially_applied"
      : "applied";

  const now =
    new Date().toISOString();

  const {
    error: importUpdateError,
  } = await privateClient
    .from(
      "catalog_sale_imports",
    )
    .update({
      status:
        finalStatus,

      applied_row_count:
        totalApplied,

      failure_message:
        null,

      applied_at:
        finalStatus ===
        "applied"
          ? now
          : null,

      updated_at:
        now,
    })
    .eq(
      "id",
      importId,
    );

  if (
    importUpdateError
  ) {
    throw importUpdateError;
  }

  return {
    importId,

    appliedThisRun,

    appliedRowCount:
      totalApplied,

    status:
      finalStatus,

    remainingReview:
      remainingReviewable,
  };
}
