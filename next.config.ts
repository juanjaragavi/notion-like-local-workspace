import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable the development indicator overlay in all modes
  devIndicators: false,

  // Enable gzip compression for production server responses
  compress: true,

  // Remove X-Powered-By header for security
  poweredByHeader: false,

  // Strip console.log/debug from production bundles via SWC minifier
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },

  // Production-tuned headers: long cache for immutable assets
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
