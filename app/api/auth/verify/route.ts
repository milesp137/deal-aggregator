import { NextResponse } from "next/server";
import { consumeLoginToken, createSession, isJsonRequest, sessionCookie, upsertUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Step 2 of sign-in: trade the emailed token for a session cookie. */
export async function POST(req: Request) {
  if (!isJsonRequest(req)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    // handled below
  }

  try {
    const login = await consumeLoginToken(token);
    if (!login) {
      return NextResponse.json(
        { error: "This sign-in link has expired or was already used. Request a new one." },
        { status: 400 },
      );
    }
    const user = await upsertUser(login.email, { marketing: login.marketing });
    const sessionToken = await createSession(user.email);
    const response = NextResponse.json({ ok: true, email: user.email });
    response.cookies.set(sessionCookie(sessionToken));
    return response;
  } catch (error) {
    console.error("[auth] verify failed:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
