import { NextResponse } from "next/server";
import { apiErrorMessage, parseJsonBody } from "@/lib/api-error";

function resolveLaneBaseUrl(): string {
  const baseUrl =
    process.env.LANE_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_LANE_API_BASE_URL?.trim() ||
    "";
  return baseUrl.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  try {
    const laneBaseUrl = resolveLaneBaseUrl();
    if (!laneBaseUrl) {
      return NextResponse.json({ error: "Lane API is not configured." }, { status: 503 });
    }

    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing Supabase bearer token for Lane request." },
        { status: 401 }
      );
    }

    const body = await parseJsonBody(request);
    const response = await fetch(`${laneBaseUrl}/generate-patch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await response.text();
    return new NextResponse(payload, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    console.error("POST /api/lane/generate-patch", error);
    return NextResponse.json({ error: apiErrorMessage(error) }, { status: 500 });
  }
}
