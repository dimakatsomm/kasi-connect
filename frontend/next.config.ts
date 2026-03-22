import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // PWA-ready: headers for service worker scope
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript" },
        ],
      },
    ];
  },
  // Allow fetching from the backend API
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
  },
  // Proxy /uploads requests to the backend API so next/image can
  // use local paths (validated against localPatterns, which allows all
  // by default) instead of absolute URLs that require remotePatterns.
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    return [
      {
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
