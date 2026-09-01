import { handleApiError, readJson } from "@/lib/api";
import { createMatch, listMatches } from "@/lib/data-store";

export async function GET() {
  try { return Response.json(await listMatches()); }
  catch (error) { return handleApiError(error); }
}

export async function POST(request: Request) {
  try { return Response.json(await createMatch(await readJson<Record<string, unknown>>(request)), { status: 201 }); }
  catch (error) { return handleApiError(error); }
}

