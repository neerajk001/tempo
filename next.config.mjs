/** @type {import('next').NextConfig} */

// The desktop (Tauri) build is a fully static, local-only export:
// no server, no API routes, no auth. Enabled by TEMPO_DESKTOP=1 so the
// normal web build is completely unaffected.
const isDesktop = process.env.TEMPO_DESKTOP === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isDesktop
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
                {
                  // Next injects inline bootstrap styles/scripts, so inline is
                  // allowed; everything else is restricted to first-party plus
                  // the media/avatar hosts the app actually uses.
                  key: "Content-Security-Policy",
                  value: [
                    "default-src 'self'",
                    "script-src 'self' 'unsafe-inline'",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob: https://*.googleusercontent.com",
                    "font-src 'self' data:",
                    "media-src 'self' blob: https://pub-ed264b7acaae4da08fd42ab957aaf2da.r2.dev",
                    "connect-src 'self' ws: wss:",
                    "worker-src 'self' blob:",
                    "frame-ancestors 'none'",
                    "base-uri 'self'",
                    "object-src 'none'",
                    "form-action 'self'",
                  ].join("; "),
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
