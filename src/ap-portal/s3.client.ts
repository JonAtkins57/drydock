// ── S3 Client Interface & Stub ──────────────────────────────────────

export interface S3Client {
  upload(bucket: string, key: string, body: Buffer): Promise<string>;
  getSignedUrl(bucket: string, key: string): Promise<string>;
}

// ── In-Memory Stub (tests / local dev) ──────────────────────────────

export function createStubS3Client(): S3Client {
  const store = new Map<string, Buffer>();

  return {
    async upload(bucket: string, key: string, body: Buffer): Promise<string> {
      const storeKey = `${bucket}/${key}`;
      store.set(storeKey, body);
      return `https://${bucket}.s3.amazonaws.com/${key}`;
    },

    async getSignedUrl(bucket: string, key: string): Promise<string> {
      const storeKey = `${bucket}/${key}`;
      if (!store.has(storeKey)) {
        throw new Error(`Object not found: ${storeKey}`);
      }
      return `https://${bucket}.s3.amazonaws.com/${key}?X-Amz-Signature=stub&X-Amz-Expires=3600`;
    },
  };
}

// ── Real S3 Client Factory ───────────────────────────────────────────

import {
  S3Client as AwsS3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createS3Client(config: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  const client = new AwsS3Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  return {
    async upload(bucket: string, key: string, body: Buffer): Promise<string> {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
      return `s3://${bucket}/${key}`;
    },

    async getSignedUrl(bucket: string, key: string): Promise<string> {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: 3600 });
    },
  };
}
