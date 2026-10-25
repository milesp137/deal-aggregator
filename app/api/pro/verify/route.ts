import { NextResponse } from "next/server";
import { isValidLicense } from "@/lib/pro";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let key = "";
  try {
    const body = (await req.json()) as { key?: unknown };
    key = typeof body.key === "string" ? body.key : "";
  } catch {
    // fall through with an empty key
  }
  const valid = await isValidLicense(key);
  return NextResponse.json({ valid, plan: valid ? "pro" : "free" });
}
