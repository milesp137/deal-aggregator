function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Deterministic SVG data-URI used when a scraped listing has no photo.
 * Keeps the MVP self-contained: no external image hosts or next/image config needed.
 */
export function placeholderImage(label: string, seed: string): string {
  const hue = hash(seed) % 360;
  const text = label.length > 30 ? `${label.slice(0, 29)}...` : label;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},55%,26%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 50) % 360},70%,10%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="640" height="400" fill="url(#g)"/>` +
    `<g opacity="0.16" stroke="#ffffff" stroke-width="2" fill="none">` +
    `<circle cx="520" cy="90" r="150"/><circle cx="520" cy="90" r="100"/><circle cx="520" cy="90" r="50"/>` +
    `</g>` +
    `<text x="32" y="360" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="rgba(255,255,255,0.85)">${escapeXml(text)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
