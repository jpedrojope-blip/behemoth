/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mantém o runtime ao lado de node_modules para que o servidor consiga
  // resolver React e Next sem depender de um junction externo.
  distDir: ".next-live",
  allowedDevOrigins: ["127.0.0.1"],
  // pdf-parse inclui o runtime ESM do PDF.js, incompatível com o bundle Webpack do servidor.
  serverExternalPackages: ["pdf-parse"],
};

module.exports = nextConfig;
