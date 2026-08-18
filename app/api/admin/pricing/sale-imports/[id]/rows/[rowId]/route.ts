import {
  SaleImportError,
  updateSaleImportRowReview,
} from "@/lib/admin-pricing/sale-import-server";

import {
  isReviewAdmin,
} from "@/lib/reviews/admin-auth";


export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      rowId: string;
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
      rowId,
    } = await params;

    const body =
      await request
        .json()
        .catch(() => null);

    if (
      !body ||
      typeof body !==
        "object" ||
      Array.isArray(body)
    ) {
      return Response.json(
        {
          error:
            "Invalid review update.",
        },
        {
          status: 400,
        },
      );
    }

    const allowed =
      new Set([
        "approved",
        "targetKind",
        "targetId",
      ]);

    for (
      const key
      of Object.keys(body)
    ) {
      if (
        !allowed.has(key)
      ) {
        return Response.json(
          {
            error:
              `Unknown review field: ${key}`,
          },
          {
            status: 400,
          },
        );
      }
    }

    const row =
      await updateSaleImportRowReview(
        id,
        rowId,
        body,
      );

    return Response.json({
      row,
    });
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
      "Sale import row review update failed",
      error,
    );

    return Response.json(
      {
        error:
          "The price-sheet review row could not be updated.",
      },
      {
        status: 500,
      },
    );
  }
}
