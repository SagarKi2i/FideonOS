import type { NextConfig } from "next";

const backendUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle into .next/standalone so the Docker
  // runner stage (frontend/docker/Dockerfile) can run `node server.js`.
  output: "standalone",
  serverExternalPackages: ["pptxgenjs", "xlsx", "jspdf", "html2canvas"],
  images: { unoptimized: true },
  trailingSlash: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
    ];
  },
  async redirects() {
    return [
      { source: '/inbox',           destination: '/approvals',             permanent: true },
      { source: '/work',            destination: '/approvals',             permanent: true },
      { source: '/mailbox',         destination: '/email',                 permanent: false },
      { source: '/review-queue',    destination: '/approvals',             permanent: false },
      { source: '/workflows',       destination: '/request-pod',           permanent: true },
      { source: '/schedules',       destination: '/automations',           permanent: true },
      { source: '/documents',       destination: '/connect',               permanent: true },
      { source: '/integrations',    destination: '/settings?tab=carriers', permanent: true },
      { source: '/dashboard',       destination: '/today',                 permanent: true },
      { source: '/connections/mcp', destination: '/connect',               permanent: true },
      { source: '/mailbox',         destination: '/email',                 permanent: false },
    ];
  },
};

export default nextConfig;
