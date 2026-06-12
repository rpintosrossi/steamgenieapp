/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@steam-genie/shared-types',
    '@steam-genie/shared-validators',
    '@steam-genie/shared-constants',
  ],
};

export default nextConfig;
