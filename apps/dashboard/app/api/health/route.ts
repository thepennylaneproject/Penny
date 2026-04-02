import { NextResponse } from "next/server";

/** Public liveness for load balancers / deploy checks (no auth). */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "penny-dashboard" },
    { status: 200 }
  );
}
