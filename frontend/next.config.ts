import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许特定的公网 IP 访问开发服务器
  experimental: {
    allowedDevOrigins: ["localhost:3001", "113.44.66.210"], 
  },
};

export default nextConfig;