import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // Prevent firebase-admin and its native deps from being bundled into Edge runtime
  serverExternalPackages: ['firebase-admin', 'data-uri-to-buffer', '@google-cloud/firestore', '@grpc/grpc-js'],
};

export default nextConfig;
