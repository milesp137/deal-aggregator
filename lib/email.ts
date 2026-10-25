/** Sends the license email through Resend's REST API (https://resend.com). No SDK needed. */

import { BILLING_PORTAL_URL } from "./plan";

export const SITE_URL = (process.env.SITE_URL || "https://deal-aggregator-coral.vercel.app").replace(/\/$/, "");

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Returns true when the email was accepted by Resend. Never throws. */
export async function sendLicenseEmail(to: string, key: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("[license] RESEND_API_KEY / EMAIL_FROM not set; license email not sent");
    return false;
  }

  // The hash fragment is never sent to a server, so the key doesn't end up in access logs.
  const activateUrl = `${SITE_URL}/#license=${encodeURIComponent(key)}`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 12px">Welcome to DealRadar Pro</h2>
      <p>Thanks for upgrading. Your license key:</p>
      <p style="font-size:18px;font-weight:bold;letter-spacing:1px;background:#f4f4f5;padding:12px 16px;border-radius:8px">${escapeHtml(key)}</p>
      <p><a href="${activateUrl}" style="display:inline-block;background:#ff4d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Activate Pro</a></p>
      <p style="color:#555;font-size:14px">The button above activates Pro in your browser. On another device, open DealRadar, click <b>Go Pro</b>, then <b>Already have a license key?</b> and paste the key. Keep this key private.</p>
      ${
        BILLING_PORTAL_URL
          ? `<p style="color:#555;font-size:14px">Need to update your card, see invoices, or cancel? <a href="${BILLING_PORTAL_URL}">Manage your subscription</a>.</p>`
          : ""
      }
    </div>`;
  const text = `Welcome to DealRadar Pro!\n\nYour license key: ${key}\n\nActivate in one click: ${activateUrl}\n\nOn another device: open DealRadar, click Go Pro, then "Already have a license key?" and paste the key. Keep it private.${
    BILLING_PORTAL_URL ? `\n\nManage your subscription (update card, invoices, cancel): ${BILLING_PORTAL_URL}` : ""
  }`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: "Your DealRadar Pro license key", html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("[license] Resend rejected the email:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[license] sending email failed:", error);
    return false;
  }
}
