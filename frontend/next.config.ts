import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pptxgenjs", "xlsx", "jspdf", "html2canvas"],
  images: { unoptimized: true },
  trailingSlash: false,
  async redirects() {
    return [
      { source: '/inbox',           destination: '/approvals',             permanent: true },
      { source: '/work',            destination: '/approvals',             permanent: true },
      { source: '/mailbox',         destination: '/approvals',             permanent: true },
      { source: '/review-queue',    destination: '/approvals',             permanent: false },
      { source: '/workflows',       destination: '/request-pod',           permanent: true },
      { source: '/schedules',       destination: '/automations',           permanent: true },
      { source: '/documents',       destination: '/connect',               permanent: true },
      { source: '/integrations',    destination: '/settings?tab=carriers', permanent: true },
      { source: '/dashboard',       destination: '/today',                 permanent: true },
      { source: '/connections/mcp', destination: '/connect',               permanent: true },
    ];
  },
};

export default nextConfig;
