import {
  readPricingRecordValues,
  updatePricingPromotionMessage,
} from "@/lib/admin-pricing/server";
import type { PricingMessageContext } from "@/lib/admin-pricing/types";
import {
  isPricingKind,
  isUuid,
} from "@/lib/admin-pricing/validation";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

function isMessageContext(
  value: unknown,
): value is PricingMessageContext {
  return value === "ids" || value === "sale";
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      kind: string;
      id: string;
    }>;
  },
) {
  if (!(await isReviewAdmin())) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { kind, id } = await context.params;

  if (!isPricingKind(kind)) {
    return json(
      { error: "Unknown pricing record kind." },
      400,
    );
  }

  if (!isUuid(id)) {
    return json(
      { error: "Invalid pricing record id." },
      400,
    );
  }

  const body = await request
    .json()
    .catch(() => null);

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return json(
      { error: "A JSON object is required." },
      422,
    );
  }

  const input = body as Record<string, unknown>;

  const unknownKey = Object.keys(input).find(
    (key) =>
      !["context", "message", "isPublic"].includes(key),
  );

  if (unknownKey) {
    return json(
      { error: `Unknown property: ${unknownKey}.` },
      422,
    );
  }

  if (!isMessageContext(input.context)) {
    return json(
      {
        error:
          "context must be either ids or sale.",
      },
      422,
    );
  }

  if (
    input.message !== null &&
    typeof input.message !== "string"
  ) {
    return json(
      {
        error:
          "message must be text or null.",
      },
      422,
    );
  }

  const message =
    typeof input.message === "string"
      ? input.message.trim() || null
      : null;

  if (message && message.length > 250) {
    return json(
      {
        error:
          "Pricing message cannot exceed 250 characters.",
      },
      422,
    );
  }

  if (typeof input.isPublic !== "boolean") {
    return json(
      {
        error:
          "isPublic must be true or false.",
      },
      422,
    );
  }

  try {
    const existing = await readPricingRecordValues(
      kind,
      id,
    );

    if (!existing) {
      return json(
        { error: "Pricing record not found." },
        404,
      );
    }

    const item =
      await updatePricingPromotionMessage(
        kind,
        id,
        input.context,
        {
          message,
          isPublic: input.isPublic,
        },
      );

    return json({
      success: true,
      item,
    });
  } catch (error) {
    console.error(
      "Pricing promotion message update failed",
      error,
    );

    return json(
      {
        error:
          "Pricing promotional message could not be saved.",
      },
      500,
    );
  }
}
