
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: 'dist',
  turbopack: {
    root: path.join(__dirname, '..'),
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
