import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  serverExternalPackages: ["nodemailer", "bcryptjs", "jsonwebtoken"],
};

export default nextConfig;
