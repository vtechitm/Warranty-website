import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // E2E runs its own dev server next to a regular one; separate build dirs keep them from clashing.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "exceljs", "pdf-lib", "@pdf-lib/fontkit"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
  async headers() {
    const csp = (frameAncestors: string) =>
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        `frame-ancestors ${frameAncestors}`,
      ].join("; ");
    return [
      // Everything except the embeddable widget may only be framed by ourselves.
      { source: "/((?!embed/).*)", headers: [...securityHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: csp("'self'") }] },
      // Lookup widget for brand websites (integration option B).
      { source: "/embed/:path*", headers: [...securityHeaders, { key: "Content-Security-Policy", value: csp("*") }] },
    ];
  },
};

export default nextConfig;
