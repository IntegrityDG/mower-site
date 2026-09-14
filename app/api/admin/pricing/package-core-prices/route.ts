import { createPackageCorePriceAdminHandlers } from "@/lib/admin-pricing/package-core-prices";
import { readPackageCorePrices, readPackageCorePriceValues, updatePackageCorePrice } from "@/lib/admin-pricing/package-core-prices-server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createPackageCorePriceAdminHandlers({
  isAdmin: isReviewAdmin,
  read: readPackageCorePrices,
  readValues: readPackageCorePriceValues,
  update: updatePackageCorePrice,
});

export const GET = handlers.GET;
