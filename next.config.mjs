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
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
