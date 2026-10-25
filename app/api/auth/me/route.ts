import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isProEmail } from "@/lib/pro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who is signed in (if anyone) and what plan they have. */
export async function GET(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ signedIn: false }, { headers });
    return NextResponse.json(
      {
        signedIn: true,
        email: user.email,
        plan: (await isProEmail(user.email)) ? "pro" : "free",
        emailAlerts: user.emailAlerts,
        marketing: user.marketing,
      },
      { headers },
    );
  } catch {
    return NextResponse.json({ signedIn: false }, { headers });
  }
}
