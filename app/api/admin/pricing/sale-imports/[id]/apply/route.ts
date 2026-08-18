import {
  applyApprovedSaleImport,
} from "@/lib/admin-pricing/sale-import-apply-server";

import {
  SaleImportError,
} from "@/lib/admin-pricing/sale-import-server";

import {
  isReviewAdmin,
} from "@/lib/reviews/admin-auth";


export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  if (
    !(await isReviewAdmin())
  ) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const {
      id,
    } = await params;

    const result =
      await applyApprovedSaleImport(
        id,
      );

    return Response.json(
      result,
    );
  } catch (error) {
    if (
      error instanceof
      SaleImportError
    ) {
      return Response.json(
        {
          error:
            error.message,
        },
        {
          status:
            error.status,
        },
      );
    }

    console.error(
      "Sale import apply failed",
      error,
    );

    return Response.json(
      {
        error:
          "The approved price-sheet rows could not be applied.",
      },
      {
        status: 500,
      },
    );
  }
}
