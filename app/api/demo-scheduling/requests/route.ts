import { createDemoRequest, readDemoRequest } from "@/lib/demo-scheduling/server";
import { notifyNewDemoRequest } from "@/lib/demo-scheduling/notifications";
import { handleDemoRequestPost } from "@/lib/demo-scheduling/request-handler";

export async function POST(request: Request) {
  return handleDemoRequestPost(request, {
    createRequest: createDemoRequest,
    readRequest: readDemoRequest,
    notifyRequest: notifyNewDemoRequest,
    onNotificationFailure: (requestId) => console.error("New demo request notification failed", { requestId }),
  });
}
