/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Adjuntos del chat (imágenes ≤5MB, PDF ≤16MB) via server action:
    // el default de 1MB rompe los envíos grandes.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
