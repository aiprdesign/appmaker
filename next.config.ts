import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Demo apps are read from disk by /api/generate when no API key is set.
  outputFileTracingIncludes: {
    "/api/generate": ["./demo-apps/**/*"],
  },
};

export default nextConfig;
