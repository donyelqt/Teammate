import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The API runs on a Cloudflare Worker at a different origin. Revalidation
  // and image hosts narrow to that origin rather than a wildcard.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.teammate.app",
      },
    ],
  },

  // Realtime payloads carry user content; keep the framework honest about it.
  poweredByHeader: false,

  eslint: {
    dirs: ["src", "app", "components", "lib"],
  },
};

export default nextConfig;
