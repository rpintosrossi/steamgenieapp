import { Injectable } from '@nestjs/common';
// TODO: Install @aws-sdk/client-s3 and configure R2 credentials
// R2 is S3-compatible; use S3Client with custom endpoint.

@Injectable()
export class StorageService {
  /**
   * TODO: Implement upload using S3Client pointed at Cloudflare R2.
   *
   * Required env vars:
   *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
   *   R2_BUCKET_NAME, R2_PUBLIC_URL
   */
  async upload(_key: string, _buffer: Buffer, _contentType: string): Promise<string> {
    throw new Error('StorageService.upload not yet implemented');
  }

  /**
   * TODO: Generate pre-signed URL with short TTL for secure photo delivery.
   */
  async getSignedUrl(_key: string, _expiresInSeconds = 900): Promise<string> {
    throw new Error('StorageService.getSignedUrl not yet implemented');
  }

  async delete(_key: string): Promise<void> {
    throw new Error('StorageService.delete not yet implemented');
  }
}
