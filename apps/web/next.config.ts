import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: join(__dirname, "../.."),
  allowedDevOrigins: ["food.coffeehq.coffee"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

