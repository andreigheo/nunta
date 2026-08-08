import type { NextConfig } from "next";

if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_DEMO_MODE_ENABLED === "true"
) {
  throw new Error(
    "Production builds must not enable NEXT_PUBLIC_DEMO_MODE_ENABLED.",
  );
}

const internalApiUrl = (
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"
).replace(/\/$/, "");

const contentSecurityPolicy =
  process.env.NODE_ENV === "production"
    ? "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.paddle.com; connect-src 'self' https://*.paddle.com; frame-src https://*.paddle.com"
    : "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob: https: http://127.0.0.1:59000; media-src 'self' blob: http://127.0.0.1:59000; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com; connect-src 'self' http://127.0.0.1:4000 http://127.0.0.1:59000 https://*.paddle.com; frame-src https://*.paddle.com";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  ...(process.env.NEXT_DISABLE_DEV_INDICATORS === "true"
    ? { devIndicators: false }
    : {}),
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${internalApiUrl}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value: contentSecurityPolicy,
      },
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains",
            },
          ]
        : []),
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
