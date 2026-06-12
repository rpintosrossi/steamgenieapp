import { ConfigService } from '@nestjs/config';

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

/**
 * Resolves S3-compatible storage (Cloudflare R2, AWS S3, MinIO).
 * Accepts S3_* vars or R2_* fallbacks from .env.example.
 */
export function resolveObjectStorageConfig(
  config: ConfigService,
): ObjectStorageConfig | null {
  const accessKeyId =
    config.get<string>('S3_ACCESS_KEY_ID') ?? config.get<string>('R2_ACCESS_KEY_ID');
  const secretAccessKey =
    config.get<string>('S3_SECRET_ACCESS_KEY') ?? config.get<string>('R2_SECRET_ACCESS_KEY');
  const bucket = config.get<string>('S3_BUCKET') ?? config.get<string>('R2_BUCKET_NAME');
  const publicBaseUrl = (
    config.get<string>('S3_PUBLIC_BASE_URL') ?? config.get<string>('R2_PUBLIC_URL') ?? ''
  ).replace(/\/$/, '');

  let endpoint = config.get<string>('S3_ENDPOINT');
  if (!endpoint) {
    const accountId = config.get<string>('R2_ACCOUNT_ID')?.trim();
    if (accountId && !accountId.startsWith('cfat_')) {
      endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    }
  }

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    endpoint,
    region: config.get<string>('S3_REGION') ?? 'auto',
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}
