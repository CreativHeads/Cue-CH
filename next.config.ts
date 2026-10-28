import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // small self-contained server for the Docker image (deploy/vps/Dockerfile)
  output: 'standalone',
};

export default nextConfig;
