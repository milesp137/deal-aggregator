import { NextResponse } from "next/server";
import { saveUser, userByUnsubToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function unsubscribe(req: Request): Promise<boolean> {
  const params = new URL(req.url).searchParams;
  const user = await userByUnsubToken(params.get("t") ?? "");
  if (!user) return false;
  const type = params.get("type");
  await saveUser({
    ...user,
    marketing: type === "alerts" ? user.marketing : false,
    emailAlerts: type === "marketing" ? user.emailAlerts : false,
  });
  return true;
}

const page = (title: string, message: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
     <body style="margin:0;background:#07080c;color:#e4e4e7;font-family:Arial,Helvetica,sans-serif;display:grid;place-items:center;min-height:100vh">
       <div style="max-width:420px;padding:24px;text-align:center">
         <h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
         <p style="color:#a1a1aa;line-height:1.5">${message}</p>
         <p><a href="/" style="color:#ff7a5c">Back to DealRadar</a></p>
       </div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/** The link in the email footer. */
export async function GET(req: Request) {
  try {
    if (await unsubscribe(req)) {
      return page("You're unsubscribed", "We won't send you those emails anymore. You can turn them back on any time from your account menu on DealRadar.");
    }
  } catch (error) {
    console.error("[unsubscribe] failed:", error);
  }
  return page("Link not recognized", "This unsubscribe link isn't valid. Sign in to DealRadar to change your email settings.", 400);
}

/** One-click unsubscribe sent by mail apps (RFC 8058). */
export async function POST(req: Request) {
  try {
    if (await unsubscribe(req)) return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[unsubscribe] failed:", error);
  }
  return NextResponse.json({ error: "Invalid link" }, { status: 400 });
}
