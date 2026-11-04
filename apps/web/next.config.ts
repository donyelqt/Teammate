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

  // `@teammate/shared` ships TypeScript sources that use `.js` specifiers for
  // ESM correctness. Webpack must map those back onto the `.ts` files.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
