import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iPhones/iPads; same radar mark as the favicon (app/icon.svg). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #ff7a45, #e8321a)",
        }}
      >
        <svg width="140" height="140" viewBox="0 0 64 64">
          <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round">
            <circle cx="32" cy="32" r="21" opacity="0.9" />
            <circle cx="32" cy="32" r="11" opacity="0.7" />
            <path d="M32 32 L48.5 15.5" />
          </g>
          <circle cx="32" cy="32" r="3.8" fill="#fff" />
          <circle cx="46" cy="43" r="3.2" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
