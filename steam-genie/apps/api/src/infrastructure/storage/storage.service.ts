import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ObjectStorageConfig,
  resolveObjectStorageConfig,
} from './storage.config';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly objectStorage: ObjectStorageConfig | null;
  private readonly localUploadDir: string;
  private s3Client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {
    this.objectStorage = resolveObjectStorageConfig(config);
    this.localUploadDir = path.join(process.cwd(), 'uploads');
  }

  onModuleInit(): void {
    if (this.objectStorage) {
      this.s3Client = new S3Client({
        region: this.objectStorage.region,
        endpoint: this.objectStorage.endpoint,
        credentials: {
          accessKeyId: this.objectStorage.accessKeyId,
          secretAccessKey: this.objectStorage.secretAccessKey,
        },
      });
      this.logger.log(
        `Storage backend: R2/S3 (bucket=${this.objectStorage.bucket}, endpoint=${this.objectStorage.endpoint})`,
      );
      if (!this.objectStorage.publicBaseUrl) {
        this.logger.warn(
          'S3_PUBLIC_BASE_URL / R2_PUBLIC_URL not set — photo URLs may be incomplete.',
        );
      }
      return;
    }

    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    if (accountId?.startsWith('cfat_')) {
      this.logger.warn(
        'R2_ACCOUNT_ID looks like an API token. Use your Cloudflare Account ID ' +
          '(Dashboard → Overview) or set S3_ENDPOINT explicitly.',
      );
    }

    this.logger.warn(
      'Object storage not configured — using local filesystem. ' +
        `Upload directory: ${this.localUploadDir}`,
    );
    fs.mkdirSync(path.join(this.localUploadDir, 'task-photos'), { recursive: true });
  }

  get usesObjectStorage(): boolean {
    return this.objectStorage !== null;
  }

  get hasPublicBaseUrl(): boolean {
    return Boolean(this.objectStorage?.publicBaseUrl);
  }

  get storageBucketName(): string {
    return this.objectStorage?.bucket ?? 'local';
  }

  generateKey(originalFilename: string, mimeType: string): string {
    const ext = this.resolveExtension(originalFilename, mimeType);
    return `task-photos/${crypto.randomUUID()}${ext}`;
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (this.objectStorage && this.s3Client) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.objectStorage.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return this.getPublicUrl(key);
    }

    return this.uploadToLocal(key, buffer);
  }

  /** Lee un objeto desde R2/S3 (para descargas autenticadas sin URL pública). */
  async getObjectBuffer(key: string): Promise<Buffer | null> {
    if (!this.objectStorage || !this.s3Client) return null;
    try {
      const res = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.objectStorage.bucket,
          Key: key,
        }),
      );
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      this.logger.warn(`getObjectBuffer failed for key=${key}: ${String(err)}`);
      return null;
    }
  }

  getPublicUrl(key: string): string {
    if (this.objectStorage?.publicBaseUrl) {
      return `${this.objectStorage.publicBaseUrl}/${key}`;
    }

    const apiUrl = (this.config.get<string>('API_URL') ?? 'http://localhost:4000').replace(
      /\/$/,
      '',
    );
    return `${apiUrl}/task-photos/serve/${encodeURIComponent(key)}`;
  }

  getLocalStream(key: string): fs.ReadStream | null {
    if (this.objectStorage) return null;
    const filePath = path.join(this.localUploadDir, key);
    if (!fs.existsSync(filePath)) return null;
    return fs.createReadStream(filePath);
  }

  async delete(key: string): Promise<void> {
    if (this.objectStorage && this.s3Client) {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.objectStorage.bucket,
          Key: key,
        }),
      );
      return;
    }

    const filePath = path.join(this.localUploadDir, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  private async uploadToLocal(key: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(this.localUploadDir, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
    return this.getPublicUrl(key);
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
