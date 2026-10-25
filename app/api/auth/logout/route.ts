import { NextResponse } from "next/server";
import { clearedSessionCookie, destroySession, isJsonRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isJsonRequest(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await destroySession(req);
  } catch {
    // the cookie is cleared regardless
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearedSessionCookie);
  return response;
}
