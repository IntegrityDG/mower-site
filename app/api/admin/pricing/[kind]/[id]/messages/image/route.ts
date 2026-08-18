import { randomUUID } from "node:crypto";

import {
  readPricingCatalog,
  readPricingRecordValues,
  updatePricingPromotionImagePath,
} from "@/lib/admin-pricing/server";
import type {
  PricingItem,
  PricingMessageContext,
} from "@/lib/admin-pricing/types";
import {
  isPricingKind,
  isUuid,
} from "@/lib/admin-pricing/validation";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

const BUCKET = "catalog-price-promotions-private";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

function messageForContext(
  item: PricingItem,
  context: PricingMessageContext,
) {
  return context === "ids"
    ? item.idsPriceMessage
    : item.salePriceMessage;
}

async function requireTarget(
  kind: string,
  id: string,
) {
  if (!isPricingKind(kind)) {
    return {
      error: json(
        { error: "Unknown pricing record kind." },
        400,
      ),
    } as const;
  }

  if (!isUuid(id)) {
    return {
      error: json(
        { error: "Invalid pricing record id." },
        400,
      ),
    } as const;
  }

  const existing = await readPricingRecordValues(
    kind,
    id,
  );

  if (!existing) {
    return {
      error: json(
        { error: "Pricing record not found." },
        404,
      ),
    } as const;
  }

  return {
    kind,
    id,
  } as const;
}

async function currentItem(
  kind: Parameters<typeof readPricingRecordValues>[0],
  id: string,
) {
  const catalog = await readPricingCatalog();

  return (
    catalog.items.find(
      (item) =>
        item.kind === kind &&
        item.id === id,
    ) ?? null
  );
}

async function signedPreviewUrl(
  path: string | null,
) {
  if (!path) return null;

  const client = getSupabaseServiceClient();

  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    console.error(
      "Pricing promotion signed URL failed",
      error,
    );
    return null;
  }

  return data.signedUrl;
}

export async function GET(
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
  const target = await requireTarget(kind, id);

  if ("error" in target) {
    return target.error;
  }

  const url = new URL(request.url);
  const messageContext = url.searchParams.get("context");

  if (!isMessageContext(messageContext)) {
    return json(
      {
        error:
          "context must be either ids or sale.",
      },
      422,
    );
  }

  try {
    const item = await currentItem(
      target.kind,
      target.id,
    );

    if (!item) {
      return json(
        { error: "Pricing record not found." },
        404,
      );
    }

    const message = messageForContext(
      item,
      messageContext,
    );

    return json({
      imagePath: message.imagePath,
      previewUrl: await signedPreviewUrl(
        message.imagePath,
      ),
    });
  } catch (error) {
    console.error(
      "Pricing promotion image lookup failed",
      error,
    );

    return json(
      {
        error:
          "Pricing promotional image could not be loaded.",
      },
      500,
    );
  }
}

export async function POST(
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
  const target = await requireTarget(kind, id);

  if ("error" in target) {
    return target.error;
  }

  const form = await request
    .formData()
    .catch(() => null);

  const file = form?.get("file");
  const messageContext = form?.get("context");

  if (!isMessageContext(messageContext)) {
    return json(
      {
        error:
          "context must be either ids or sale.",
      },
      422,
    );
  }

  if (
    !(file instanceof File) ||
    !IMAGE_TYPES[file.type]
  ) {
    return json(
      {
        error:
          "Upload a JPEG, PNG, or WebP image.",
      },
      400,
    );
  }

  if (file.size <= 0) {
    return json(
      { error: "The image is empty." },
      400,
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return json(
      {
        error:
          "Promotional image must be 10 MB or smaller.",
      },
      400,
    );
  }

  const client = getSupabaseServiceClient();

  try {
    const before = await currentItem(
      target.kind,
      target.id,
    );

    if (!before) {
      return json(
        { error: "Pricing record not found." },
        404,
      );
    }

    const oldPath = messageForContext(
      before,
      messageContext,
    ).imagePath;

    const extension = IMAGE_TYPES[file.type];

    const storagePath =
      `pricing/${target.kind}/${target.id}/${messageContext}/${randomUUID()}.${extension}`;

    const upload = await client.storage
      .from(BUCKET)
      .upload(
        storagePath,
        await file.arrayBuffer(),
        {
          contentType: file.type,
          upsert: false,
        },
      );

    if (upload.error) {
      console.error(
        "Pricing promotion image upload failed",
        upload.error,
      );

      return json(
        {
          error:
            "Promotional image upload failed.",
        },
        500,
      );
    }

    let updated: PricingItem;

    try {
      updated =
        await updatePricingPromotionImagePath(
          target.kind,
          target.id,
          messageContext,
          storagePath,
        );
    } catch (error) {
      await client.storage
        .from(BUCKET)
        .remove([storagePath]);

      throw error;
    }

    let cleanupWarning = false;

    if (
      oldPath &&
      oldPath !== storagePath
    ) {
      const cleanup = await client.storage
        .from(BUCKET)
        .remove([oldPath]);

      if (cleanup.error) {
        cleanupWarning = true;

        console.error(
          "Old pricing promotion image cleanup failed",
          cleanup.error,
        );
      }
    }

    return json({
      success: true,
      item: updated,
      previewUrl: await signedPreviewUrl(
        storagePath,
      ),
      cleanupWarning,
    });
  } catch (error) {
    console.error(
      "Pricing promotion image save failed",
      error,
    );

    return json(
      {
        error:
          "Promotional image could not be saved.",
      },
      500,
    );
  }
}

export async function DELETE(
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
  const target = await requireTarget(kind, id);

  if ("error" in target) {
    return target.error;
  }

  const url = new URL(request.url);
  const messageContext = url.searchParams.get("context");

  if (!isMessageContext(messageContext)) {
    return json(
      {
        error:
          "context must be either ids or sale.",
      },
      422,
    );
  }

  const client = getSupabaseServiceClient();

  try {
    const before = await currentItem(
      target.kind,
      target.id,
    );

    if (!before) {
      return json(
        { error: "Pricing record not found." },
        404,
      );
    }

    const oldPath = messageForContext(
      before,
      messageContext,
    ).imagePath;

    const updated =
      await updatePricingPromotionImagePath(
        target.kind,
        target.id,
        messageContext,
        null,
      );

    let cleanupWarning = false;

    if (oldPath) {
      const cleanup = await client.storage
        .from(BUCKET)
        .remove([oldPath]);

      if (cleanup.error) {
        cleanupWarning = true;

        console.error(
          "Pricing promotion image removal failed",
          cleanup.error,
        );
      }
    }

    return json({
      success: true,
      item: updated,
      cleanupWarning,
    });
  } catch (error) {
    console.error(
      "Pricing promotion image delete failed",
      error,
    );

    return json(
      {
        error:
          "Promotional image could not be removed.",
      },
      500,
    );
  }
}
