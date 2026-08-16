import {
  PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS,
  readPublicTroubleshootingPhoto,
} from "@/lib/public-troubleshooting/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const photo = await readPublicTroubleshootingPhoto((await params).id);
    if (!photo) throw new Error("NOT_FOUND");
    return new Response(photo.body, {
      headers: {
        ...PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS,
        "content-disposition": 'inline; filename="troubleshooting-photo.jpg"',
        "content-type": photo.contentType,
        "cross-origin-resource-policy": "same-origin",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Photo not found." },
      { status: 404, headers: PUBLIC_TROUBLESHOOTING_NO_STORE_HEADERS },
    );
  }
}
