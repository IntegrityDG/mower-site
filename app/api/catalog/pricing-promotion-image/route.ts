import {
  activePublicPromotionContext,
  type PublicPromotionContext,
  type PublicPromotionTargetKind,
} from "@/lib/catalog/public-price-promotion";
import {
  scheduledPublicPrice,
  type PublicPriceRow,
} from "@/lib/catalog/public-price";
import {
  PUBLIC_CATALOG_STATUSES,
} from "@/lib/catalog/availability";
import type {
  ActivePriceSchedule,
} from "@/lib/catalog/active-price-schedule";
import {
  readPricingProgramSettingsFailSafe,
} from "@/lib/pricing-program/server";
import {
  getSupabaseCatalogClient,
  getSupabaseServiceClient,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BUCKET =
  "catalog-price-promotions-private";

const tables: Record<
  PublicPromotionTargetKind,
  string
> = {
  product: "catalog_products",
  variant: "catalog_product_variants",
  option: "catalog_options",
  package: "catalog_packages",
};

const targetColumns: Record<
  PublicPromotionTargetKind,
  string
> = {
  product: "product_id",
  variant: "variant_id",
  option: "option_id",
  package: "package_id",
};

function isUuid(value: string | null): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

function isKind(
  value: string | null,
): value is PublicPromotionTargetKind {
  return (
    value === "product" ||
    value === "variant" ||
    value === "option" ||
    value === "package"
  );
}

function isContext(
  value: string | null,
): value is PublicPromotionContext {
  return value === "ids" || value === "sale";
}

function notFound() {
  return new Response("Not found.", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");
  const context =
    url.searchParams.get("context");
  const requestedScheduleId =
    url.searchParams.get("schedule");

  if (
    !isKind(kind) ||
    !isUuid(id) ||
    !isContext(context) ||
    (
      requestedScheduleId !== null &&
      !isUuid(requestedScheduleId)
    )
  ) {
    return notFound();
  }

  const publicClient =
    getSupabaseCatalogClient();

  const { data: row, error: rowError } =
    await publicClient
      .from(tables[kind])
      .select(
        "display_msrp_price_cents,regular_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,promotion_label,show_public_price,contact_for_pricing,public_status",
      )
      .eq("id", id)
      .in(
        "public_status",
        [...PUBLIC_CATALOG_STATUSES],
      )
      .limit(1)
      .maybeSingle();

  if (rowError || !row) {
    return notFound();
  }

  const scheduleColumn =
    targetColumns[kind];

  const {
    data: scheduleRows,
    error: scheduleError,
  } = await publicClient
    .from("catalog_price_schedules")
    .select(
      "id,schedule_name,product_id,variant_id,option_id,package_id,service_id,product_service_id,starts_at,ends_at,regular_price_cents,sale_price_cents,promotion_label,show_public_price,contact_for_pricing,public_status",
    )
    .eq(scheduleColumn, id)
    .eq("public_status", "active");

  if (scheduleError) {
    return notFound();
  }

  const { everydayLowPriceEnabled } =
    await readPricingProgramSettingsFailSafe();

  const scheduled = scheduledPublicPrice(
    row as PublicPriceRow,
    (scheduleRows ?? []) as ActivePriceSchedule[],
    kind,
    id,
    Date.now(),
    everydayLowPriceEnabled,
  );

  const activeScheduleId =
    scheduled.schedule?.id ?? null;

  /*
   * The image request has to match the pricing
   * schedule that is active RIGHT NOW.
   *
   * That means an old image URL cannot continue
   * serving a promotion after its sale ends.
   */
  if (
    activeScheduleId !==
    (requestedScheduleId ?? null)
  ) {
    return notFound();
  }

  const activeContext =
    activePublicPromotionContext(
      scheduled.price,
    );

  /*
   * Same rule for IDS vs Sale content:
   * only the currently-active pricing context
   * is allowed to retrieve an image.
   */
  if (activeContext !== context) {
    return notFound();
  }

  const serviceClient =
    getSupabaseServiceClient();

  const privateCatalog =
    serviceClient.schema(
      "catalog_private",
    );

  let messageQuery = privateCatalog
    .from("catalog_price_messages")
    .select("image_path")
    .eq("price_context", context)
    .eq("is_public", true);

  if (activeScheduleId) {
    messageQuery =
      messageQuery.eq(
        "price_schedule_id",
        activeScheduleId,
      );
  } else {
    messageQuery =
      messageQuery.eq(
        targetColumns[kind],
        id,
      );
  }

  const {
    data: message,
    error: messageError,
  } = await messageQuery
    .limit(1)
    .maybeSingle();

  if (
    messageError ||
    !message ||
    typeof message.image_path !==
      "string" ||
    !message.image_path
  ) {
    return notFound();
  }

  const {
    data: image,
    error: imageError,
  } = await serviceClient.storage
    .from(BUCKET)
    .download(message.image_path);

  if (imageError || !image) {
    return notFound();
  }

  const allowedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  if (!allowedTypes.has(image.type)) {
    return notFound();
  }

  return new Response(image, {
    status: 200,
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
