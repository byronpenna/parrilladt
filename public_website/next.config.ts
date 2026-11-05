import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Evita que Turbopack confunda esta app con el proyecto padre
  // (pedidos-cancha) por tener su propio lockfile anidado.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pedidos-cancha-fotos-productos.s3.*.amazonaws.com',
      },
    ],
  },
};

export default nextConfig;
