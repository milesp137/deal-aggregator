import { SITE_URL } from "./email";
import { formatPrice } from "./format";
import type { User } from "./auth";
import { SOURCE_NAMES, type Listing } from "./types";

/** Resend helper plus the sign-in, alert and marketing email templates. */

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Returns true when Resend accepted the email. Never throws. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("[mail] RESEND_API_KEY / EMAIL_FROM not set; email not sent");
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.headers ? { headers: mail.headers } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("[mail] Resend rejected the email:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[mail] sending failed:", error);
    return false;
  }
}

/* ---------------------------------------------------------------- helpers */

export const unsubscribeUrl = (user: User, type: "marketing" | "alerts") =>
  `${SITE_URL}/api/email/unsubscribe?t=${user.unsubToken}&type=${type}`;

/** One-click unsubscribe headers (Gmail and Yahoo require these for bulk senders). */
const unsubscribeHeaders = (url: string) => ({
  "List-Unsubscribe": `<${url}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

/** Postal address line; US law (CAN-SPAM) requires one in marketing email. Set MAIL_FOOTER_ADDRESS. */
const footerAddress = () => (process.env.MAIL_FOOTER_ADDRESS ?? "").trim();

function layout(body: string, footer: string): string {
  return `
  <div style="background:#f4f4f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;color:#111">
      <p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#ff4d2e">DealRadar</p>
      ${body}
    </div>
    <div style="max-width:560px;margin:12px auto 0;color:#777;font-size:12px;line-height:1.5;text-align:center">${footer}</div>
  </div>`;
}

/* ---------------------------------------------------------------- sign-in */

export function loginEmail(link: string): Omit<Mail, "to"> {
  const html = layout(
    `<h2 style="margin:0 0 12px">Sign in to DealRadar</h2>
     <p>Click the button to sign in. The link works once and expires in 15 minutes.</p>
     <p><a href="${link}" style="display:inline-block;background:#ff4d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Sign in</a></p>
     <p style="color:#555;font-size:14px">If you didn't ask for this, you can ignore this email. Nobody can sign in without the link.</p>`,
    "You received this because someone entered this address on DealRadar.",
  );
  const text = `Sign in to DealRadar\n\nOpen this link (works once, expires in 15 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.`;
  return { subject: "Your DealRadar sign-in link", html, text };
}

/* ----------------------------------------------------------------- alerts */

export interface AlertMatches {
  keyword: string;
  listings: Listing[];
  /** Matches beyond the ones shown. */
  more: number;
}

export function alertEmail(user: User, groups: AlertMatches[]): Omit<Mail, "to"> {
  const total = groups.reduce((sum, group) => sum + group.listings.length + group.more, 0);
  const first = groups[0]?.keyword ?? "your alerts";
  const unsubscribe = unsubscribeUrl(user, "alerts");

  const cards = groups
    .map((group) => {
      const items = group.listings
        .map((listing) => {
          const image = listing.imageUrl.startsWith("http")
            ? `<img src="${escapeHtml(listing.imageUrl)}" alt="" width="88" height="66" style="border-radius:6px;object-fit:cover;display:block">`
            : "";
          const url = escapeHtml(listing.url ?? SITE_URL);
          return `<tr>
            <td style="padding:8px 12px 8px 0;vertical-align:top;width:88px">${image}</td>
            <td style="padding:8px 0;vertical-align:top">
              <a href="${url}" style="color:#111;font-weight:bold;text-decoration:none">${escapeHtml(listing.title)}</a><br>
              <span style="font-size:18px;font-weight:bold">${formatPrice(listing.price)}</span>
              <span style="color:#555;font-size:13px"> &middot; ${
                listing.auction ? "current bid, auction" : `deal score ${listing.dealScore}/10`
              } &middot; ${escapeHtml(SOURCE_NAMES[listing.sourcePlatform])}</span>
            </td></tr>`;
        })
        .join("");
      const more = group.more > 0 ? `<p style="color:#555;font-size:13px">+ ${group.more} more on DealRadar</p>` : "";
      return `<h3 style="margin:20px 0 4px;font-size:15px">New matches for &ldquo;${escapeHtml(group.keyword)}&rdquo;</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>${more}`;
    })
    .join("");

  const body = `<h2 style="margin:0 0 4px">${total} new ${total === 1 ? "deal" : "deals"} for you</h2>${cards}
    <p style="margin-top:20px"><a href="${SITE_URL}" style="display:inline-block;background:#ff4d2e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Open DealRadar</a></p>`;

  const footer = `You're getting this because you set up alerts on DealRadar.<br>
    <a href="${unsubscribe}" style="color:#777">Stop alert emails</a> &middot; <a href="${SITE_URL}" style="color:#777">Manage alerts</a>`;

  const text =
    groups
      .map(
        (group) =>
          `New matches for "${group.keyword}":\n` +
          group.listings
            .map(
              (l) =>
                `- ${l.title} - ${formatPrice(l.price)} (${
                  l.auction ? "current bid, auction" : `score ${l.dealScore}/10`
                })\n  ${l.url ?? SITE_URL}`,
            )
            .join("\n") +
          (group.more > 0 ? `\n+ ${group.more} more on DealRadar` : ""),
      )
      .join("\n\n") + `\n\nOpen DealRadar: ${SITE_URL}\nStop alert emails: ${unsubscribe}`;

  return {
    subject: `${total} new ${total === 1 ? "deal" : "deals"} for "${first}"`,
    html: layout(body, footer),
    text,
    headers: unsubscribeHeaders(unsubscribe),
  };
}

/* -------------------------------------------------------------- marketing */

/** Wraps an admin-written message with the required unsubscribe link and postal address. */
export function marketingEmail(
  user: User | null,
  subject: string,
  bodyHtml: string,
  bodyText: string,
): Omit<Mail, "to"> {
  const unsubscribe = user ? unsubscribeUrl(user, "marketing") : null;
  const address = footerAddress();
  const footer = [
    "You're getting this because you signed up for updates on DealRadar.",
    unsubscribe ? `<a href="${unsubscribe}" style="color:#777">Unsubscribe</a>` : "",
    address ? escapeHtml(address) : "",
  ]
    .filter(Boolean)
    .join("<br>");
  const text = `${bodyText}\n\n--\nYou're getting this because you signed up for updates on DealRadar.${
    unsubscribe ? `\nUnsubscribe: ${unsubscribe}` : ""
  }${address ? `\n${address}` : ""}`;
  return {
    subject,
    html: layout(bodyHtml, footer),
    text,
    ...(unsubscribe ? { headers: unsubscribeHeaders(unsubscribe) } : {}),
  };
}
