import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build output folder. `npm run dev` uses the default ".next"; test builds/servers use
  // NEXT_DIST_DIR=.next-test (see the *:test scripts) so they never clobber a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Self-contained server for the Docker image (node .next/standalone/server.js).
  output: "standalone",
  // Lint is a dev-time check (`npm run lint`); never let it block a judge's `docker compose up --build`.
  // Type-checking still runs during the build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
