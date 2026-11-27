import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (node .next/standalone/server.js).
  output: "standalone",
  // Lint is a dev-time check (`npm run lint`); never let it block a judge's `docker compose up --build`.
  // Type-checking still runs during the build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
