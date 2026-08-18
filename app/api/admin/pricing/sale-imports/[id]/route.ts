import {
  readSaleImportReview,
  SaleImportError,
} from "@/lib/admin-pricing/sale-import-server";

import {
  isReviewAdmin,
} from "@/lib/reviews/admin-auth";


export async function GET(
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

    return Response.json(
      await readSaleImportReview(
        id,
      ),
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
      "Sale import review load failed",
      error,
    );

    return Response.json(
      {
        error:
          "The price-sheet review could not be loaded.",
      },
      {
        status: 500,
      },
    );
  }
}
