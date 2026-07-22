import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["food.coffeehq.coffee"],
};

export default nextConfig;
