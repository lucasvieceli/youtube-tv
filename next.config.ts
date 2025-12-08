import type { NextConfig } from "next";

const repoName =
  process.env.NEXT_PUBLIC_BASE_PATH?.replace(/^\/+/, "").replace(/\/+$/, "") ||
  process.env.GITHUB_REPOSITORY?.split("/")[1];
const isProd = process.env.NODE_ENV === "production";
const basePath = isProd && repoName ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  basePath,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
