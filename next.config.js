/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    workerThreads: false,
    cpus: 1,
    serverComponentsExternalPackages: ["sharp", "archiver"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.backblazeb2.com",
      },
    ],
  },
};

module.exports = nextConfig;
