import {
  createSaleImportPreview,
  readSaleImportAdminData,
  SaleImportError,
} from "@/lib/admin-pricing/sale-import-server";

import {
  isReviewAdmin,
} from "@/lib/reviews/admin-auth";


export async function GET() {
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
    return Response.json(
      await readSaleImportAdminData(),
    );
  } catch {
    return Response.json(
      {
        error:
          "Price-sheet import history could not be loaded.",
      },
      {
        status: 500,
      },
    );
  }
}


export async function POST(
  request: Request,
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
    const form =
      await request
        .formData()
        .catch(() => null);

    if (!form) {
      return Response.json(
        {
          error:
            "The upload form could not be read.",
        },
        {
          status: 400,
        },
      );
    }

    const file =
      form.get("file");

    const brand =
      String(
        form.get("brand") ?? "",
      ).trim();

    if (
      !(file instanceof File)
    ) {
      return Response.json(
        {
          error:
            "Choose a price sheet to upload.",
        },
        {
          status: 400,
        },
      );
    }

    if (!brand) {
      return Response.json(
        {
          error:
            "Choose the manufacturer for this price sheet.",
        },
        {
          status: 400,
        },
      );
    }

    const preview =
      await createSaleImportPreview(
        file,
        brand,
      );

    return Response.json(
      preview,
      {
        status: 201,
      },
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
      "Sale sheet import failed",
      error,
    );

    return Response.json(
      {
        error:
          "The price sheet could not be imported for review.",
      },
      {
        status: 500,
      },
    );
  }
}
