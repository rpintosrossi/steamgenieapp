import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@steam-genie/shared-types',
    '@steam-genie/shared-validators',
    '@steam-genie/shared-constants',
  ],
};

export default nextConfig;
