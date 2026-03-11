import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bypass remote image hostname checks (Google OAuth profile pics)
  images: {
    unoptimized: true,
  },

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

  // Production-tuned headers
  async headers() {
    return [
      // Immutable hashed assets — safe to cache forever
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Everything else — strict no-cache for live data
      {
        source: "/((?!_next/static).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
};

export default nextConfig;
