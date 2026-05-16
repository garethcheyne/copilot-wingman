import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack(config) {
    if (config.optimization?.splitChunks) {
      config.optimization.splitChunks.automaticNameDelimiter = "-";
    }
    return config;
  },
};

export default nextConfig;
