import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

/** Pages: no plugins, no <base> tricks, and only this site may frame them. */
const pageCsp = { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" };

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The headless browser driver for website screenshots runs from node_modules, unbundled.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // Demo apps are read from disk by /api/generate when no API key is set.
  outputFileTracingIncludes: {
    "/api/generate": ["./demo-apps/**/*"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses set their own policy where they need one (e.g. uploaded photos).
      { source: "/((?!api/).*)", headers: [pageCsp] },
      {
        // The preview runtime is loaded by sandboxed (opaque-origin) iframes.
        source: "/preview/:file*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
