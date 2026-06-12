import type { NextConfig } from "next";

const baseConfig: NextConfig = {
  reactStrictMode: true,
};

const withSerwist = async (config: NextConfig): Promise<NextConfig> => {
  const { default: withSerwistInit } = await import("@serwist/next");
  return withSerwistInit({
    swSrc: "src/sw.ts",
    swDest: "public/sw.js",
    disable: process.env.NODE_ENV !== "production",
  })(config);
};

export default async () => withSerwist(baseConfig);
