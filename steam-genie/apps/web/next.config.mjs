import os from 'os';

function getLanDevOrigins() {
  const port = process.env.WEB_PORT ?? '3000';
  const origins = new Set(['localhost', '127.0.0.1']);

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const net of interfaces ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        origins.add(net.address);
      }
    }
  }

  return [...origins].map((host) => `http://${host}:${port}`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@steam-genie/shared-types',
    '@steam-genie/shared-validators',
    '@steam-genie/shared-constants',
  ],
  allowedDevOrigins: getLanDevOrigins(),
  async headers() {
    return [
      {
        source: '/downloads/:file*.apk',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/vnd.android.package-archive',
          },
          {
            key: 'Content-Disposition',
            value: 'attachment; filename="steam-genie.apk"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
