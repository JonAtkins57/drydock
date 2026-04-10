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

// ── Real S3 Client Factory (placeholder) ────────────────────────────
// Swap in @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner when ready.

export function createS3Client(_config: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  // TODO: Wire up real AWS SDK calls
  return createStubS3Client();
}
