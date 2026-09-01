import { handleApiError } from "@/lib/api";
import { requireManagementWorkspace } from "@/lib/auth";
import { claimMediaLinkToken, createMediaLinkToken, getMediaLinkStatus } from "@/lib/media-link";

export async function GET() {
  try {
    return Response.json(await getMediaLinkStatus(await requireManagementWorkspace()));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireManagementWorkspace();
    const body = await request.json();
    if (body.action === "create") return Response.json(await createMediaLinkToken(account), { status: 201 });
    if (body.action === "claim") return Response.json(await claimMediaLinkToken(account, typeof body.token === "string" ? body.token : ""));
    return Response.json({ error: "Invalid cloud library linking action." }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}

