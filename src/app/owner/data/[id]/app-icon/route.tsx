import { ImageResponse } from "next/og";

/** The owner app's Home Screen icon: a bell on the brand gradient. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = [180, 192, 512].includes(Number(url.searchParams.get("size"))) ? Number(url.searchParams.get("size")) : 192;
  const maskable = url.searchParams.get("maskable") === "1";
  const bell = Math.round(size * (maskable ? 0.42 : 0.55));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #8b5cf6, #10b981)" }}>
        <svg width={bell} height={bell} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
