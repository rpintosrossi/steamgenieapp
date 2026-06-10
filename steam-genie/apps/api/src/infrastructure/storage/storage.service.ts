import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * StorageService — MVP implementation
 *
 * Local filesystem is the default backend.
 * Set the following env vars to switch to any S3-compatible bucket (Cloudflare R2, AWS S3, MinIO, etc.):
 *
 *   S3_ENDPOINT         — full URL, e.g. https://<accountid>.r2.cloudflarestorage.com
 *   S3_REGION           — e.g. "auto" for R2
 *   S3_BUCKET           — bucket name
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_PUBLIC_BASE_URL  — base URL for public files, e.g. https://pub-xxx.r2.dev
 *
 * TODO: install @aws-sdk/client-s3 before enabling S3/R2 backend.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly isS3Configured: boolean;
  private readonly localUploadDir: string;

  constructor(private readonly config: ConfigService) {
    this.isS3Configured = !!(
      config.get<string>('S3_ENDPOINT') &&
      config.get<string>('S3_ACCESS_KEY_ID') &&
      config.get<string>('S3_SECRET_ACCESS_KEY') &&
      config.get<string>('S3_BUCKET')
    );

    this.localUploadDir = path.join(process.cwd(), 'uploads');

    if (this.isS3Configured) {
      this.logger.log('Storage backend: S3/R2');
    } else {
      this.logger.warn(
        'S3/R2 not configured — using local filesystem. ' +
        `Upload directory: ${this.localUploadDir}`,
      );
      fs.mkdirSync(path.join(this.localUploadDir, 'task-photos'), { recursive: true });
    }
  }

  /**
   * Generate a unique storage key for a photo.
   * Format: task-photos/{uuid}.{ext}
   */
  generateKey(originalFilename: string, mimeType: string): string {
    const ext = this.resolveExtension(originalFilename, mimeType);
    return `task-photos/${crypto.randomUUID()}${ext}`;
  }

  /**
   * Upload a file buffer to storage.
   * Returns the public URL (or internal serve URL for local storage).
   */
  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (this.isS3Configured) {
      return this.uploadToS3(key, buffer, contentType);
    }
    return this.uploadToLocal(key, buffer);
  }

  /**
   * Returns the public URL for a stored file.
   * For local storage: points to the authenticated serve endpoint.
   * For S3/R2: returns the public base URL + key.
   */
  getPublicUrl(key: string): string {
    if (this.isS3Configured) {
      const base = (this.config.get<string>('S3_PUBLIC_BASE_URL') ?? '').replace(/\/$/, '');
      return `${base}/${key}`;
    }
    const apiUrl = (this.config.get<string>('API_URL') ?? 'http://localhost:4000').replace(/\/$/, '');
    return `${apiUrl}/task-photos/serve/${encodeURIComponent(key)}`;
  }

  /**
   * Returns a read stream for a locally stored file.
   * Returns null if file does not exist or S3 is configured.
   */
  getLocalStream(key: string): fs.ReadStream | null {
    if (this.isS3Configured) return null;
    const filePath = path.join(this.localUploadDir, key);
    if (!fs.existsSync(filePath)) return null;
    return fs.createReadStream(filePath);
  }

  /**
   * Delete a file from storage.
   * For local storage: deletes the file from disk.
   * For S3/R2: TODO (requires @aws-sdk/client-s3).
   */
  async delete(key: string): Promise<void> {
    if (this.isS3Configured) {
      // TODO: install @aws-sdk/client-s3 and implement S3 delete
      this.logger.error('S3/R2 delete not yet implemented.');
      return;
    }
    const filePath = path.join(this.localUploadDir, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async uploadToLocal(key: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(this.localUploadDir, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
    return this.getPublicUrl(key);
  }

  private async uploadToS3(
    _key: string,
    _buffer: Buffer,
    _contentType: string,
  ): Promise<string> {
    // TODO: install @aws-sdk/client-s3
    // const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    // const client = new S3Client({ endpoint, region, credentials });
    // await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    throw new Error(
      'S3/R2 upload not yet implemented. Install @aws-sdk/client-s3 and uncomment the implementation.',
    );
  }

  private resolveExtension(filename: string, mimeType: string): string {
    const extFromName = path.extname(filename).toLowerCase();
    if (extFromName) return extFromName;
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/heic': '.heic',
      'image/heif': '.heif',
    };
    return mimeToExt[mimeType] ?? '.bin';
  }
}
