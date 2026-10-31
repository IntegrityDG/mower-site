import * as runtime from "react/jsx-runtime";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import CatalogHeader from "../../components/equipment/CatalogHeader";
import GenericProductDetail from "../../components/equipment/GenericProductDetail";
import LymowInformationSections from "../../components/equipment/LymowInformationSections";
import LymowPriceDisplay from "../../components/equipment/LymowPriceDisplay";
import * as lymowBrochure from "../../components/equipment/lymowBrochureContent";
import PandagInformationSections from "../../components/equipment/PandagInformationSections";
import * as pandagBrochure from "../../components/equipment/pandagBrochureContent";
import ProductBuildCta from "../../components/equipment/ProductBuildCta";
import ProductPageSections from "../../components/equipment/ProductPageSections";
import QuoteOnlyNotice from "../../components/equipment/QuoteOnlyNotice";
import YarboInformationSections from "../../components/equipment/YarboInformationSections";
import YarboStartingPriceDisplay from "../../components/equipment/YarboStartingPriceDisplay";
import BreadcrumbJsonLd, * as breadcrumb from "../../components/seo/BreadcrumbJsonLd";
import * as pricing from "../../lib/catalog/pricing";
import * as startingPrice from "../../lib/catalog/starting-price";
import * as customerFacingOptions from "../../lib/catalog/customer-facing-options";
import * as routing from "../../lib/catalog/product-routing";
import type { CatalogResponse } from "../../lib/catalog/types";
import * as yarbo from "../../lib/catalog/yarbo";
import { loadInstallationModule } from "./installation-module";

// Render the actual route and all its presentational children. The catalog read
// is the only substituted boundary, so these tests never call the database.
export function equipmentProductPage(catalog: CatalogResponse | Error) {
  return loadInstallationModule<typeof import("../../app/equipment/[slug]/page")>(
    "app/equipment/[slug]/page.tsx",
    {
      "react/jsx-runtime": runtime,
      "next/image": Image,
      "next/link": Link,
      "next/navigation": { notFound },
      "@/components/equipment/CatalogHeader": CatalogHeader,
      "@/components/equipment/GenericProductDetail": GenericProductDetail,
      "@/components/equipment/LymowInformationSections": LymowInformationSections,
      "@/components/equipment/LymowPriceDisplay": LymowPriceDisplay,
      "@/components/equipment/lymowBrochureContent": lymowBrochure,
      "@/components/equipment/PandagInformationSections": PandagInformationSections,
      "@/components/equipment/pandagBrochureContent": pandagBrochure,
      "@/components/equipment/ProductBuildCta": ProductBuildCta,
      "@/components/equipment/ProductPageSections": ProductPageSections,
      "@/components/equipment/QuoteOnlyNotice": QuoteOnlyNotice,
      "@/components/equipment/YarboInformationSections": YarboInformationSections,
      "@/components/equipment/YarboStartingPriceDisplay": YarboStartingPriceDisplay,
      "@/components/seo/BreadcrumbJsonLd": { __esModule: true, ...breadcrumb, default: BreadcrumbJsonLd },
      "@/lib/catalog/pricing": pricing,
      "@/lib/catalog/starting-price": startingPrice,
      "@/lib/catalog/customer-facing-options": customerFacingOptions,
      "@/lib/catalog/load-public-catalog": {
        loadPublicCatalog: async () => {
          if (catalog instanceof Error) throw catalog;
          return catalog;
        },
      },
      "@/lib/catalog/product-routing": routing,
      "@/lib/catalog/yarbo": yarbo,
    },
  );
}
