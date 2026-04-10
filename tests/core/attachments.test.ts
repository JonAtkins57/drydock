import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockGetSignedUrl = vi.fn();

  return { mockSend, mockGetSignedUrl };
});

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = mocks.mockSend;
  }
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class DeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mocks.mockGetSignedUrl,
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import { uploadFile, getPresignedUrl } from '../../src/core/s3.js';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ENTITY_TYPE = 'invoice';
const ENTITY_ID = '11111111-2222-3333-4444-555555555555';
const FILENAME = 'invoice.pdf';
const MIME_TYPE = 'application/pdf';
const BUFFER = Buffer.from('fake-pdf-content');

describe('s3 module', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
    savedEnv.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
    savedEnv.AWS_REGION = process.env.AWS_REGION;
    savedEnv.S3_BUCKET = process.env.S3_BUCKET;

    process.env.AWS_ACCESS_KEY_ID = 'test-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.AWS_REGION = 'us-east-1';
    process.env.S3_BUCKET = 'test-bucket';
  });

  afterEach(() => {
    process.env.AWS_ACCESS_KEY_ID = savedEnv.AWS_ACCESS_KEY_ID;
    process.env.AWS_SECRET_ACCESS_KEY = savedEnv.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_REGION = savedEnv.AWS_REGION;
    process.env.S3_BUCKET = savedEnv.S3_BUCKET;
  });

  describe('uploadFile', () => {
    it('constructs s3Key in {tenantId}/{entityType}/{entityId}/{uuid}-{filename} format', async () => {
      mocks.mockSend.mockResolvedValueOnce({});

      const s3Key = await uploadFile(TENANT_ID, ENTITY_TYPE, ENTITY_ID, FILENAME, BUFFER, MIME_TYPE);

      // Pattern: tenantId/entityType/entityId/<uuid>-filename
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      const parts = s3Key.split('/');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe(TENANT_ID);
      expect(parts[1]).toBe(ENTITY_TYPE);
      expect(parts[2]).toBe(ENTITY_ID);
      const [uuid, ...rest] = parts[3].split('-invoice.pdf');
      expect(uuidPattern.test(uuid)).toBe(true);
      expect(rest.join('-invoice.pdf')).toBe('');
      expect(parts[3].endsWith(`-${FILENAME}`)).toBe(true);
    });

    it('calls S3Client.send with PutObjectCommand using correct bucket/key/body/contentType', async () => {
      mocks.mockSend.mockResolvedValueOnce({});

      const s3Key = await uploadFile(TENANT_ID, ENTITY_TYPE, ENTITY_ID, FILENAME, BUFFER, MIME_TYPE);

      expect(mocks.mockSend).toHaveBeenCalledOnce();
      const cmd = mocks.mockSend.mock.calls[0][0];
      expect(cmd.input.Bucket).toBe('test-bucket');
      expect(cmd.input.Key).toBe(s3Key);
      expect(cmd.input.Body).toBe(BUFFER);
      expect(cmd.input.ContentType).toBe(MIME_TYPE);
    });

    it('throws descriptively when AWS_ACCESS_KEY_ID is missing', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      await expect(uploadFile(TENANT_ID, ENTITY_TYPE, ENTITY_ID, FILENAME, BUFFER, MIME_TYPE))
        .rejects.toThrow('AWS_ACCESS_KEY_ID');
    });

    it('throws descriptively when AWS_SECRET_ACCESS_KEY is missing', async () => {
      delete process.env.AWS_SECRET_ACCESS_KEY;
      await expect(uploadFile(TENANT_ID, ENTITY_TYPE, ENTITY_ID, FILENAME, BUFFER, MIME_TYPE))
        .rejects.toThrow('AWS_SECRET_ACCESS_KEY');
    });

    it('throws descriptively when AWS_REGION is missing', async () => {
      delete process.env.AWS_REGION;
      await expect(uploadFile(TENANT_ID, ENTITY_TYPE, ENTITY_ID, FILENAME, BUFFER, MIME_TYPE))
        .rejects.toThrow('AWS_REGION');
    });

    it('throws descriptively when S3_BUCKET is missing', async () => {
      delete process.env.S3_BUCKET;
      await expect(uploadFile(TENANT_ID, ENTITY_TYPE, ENTITY_ID, FILENAME, BUFFER, MIME_TYPE))
        .rejects.toThrow('S3_BUCKET');
    });
  });

  describe('getPresignedUrl', () => {
    it('calls GetObjectCommand with correct bucket and key', async () => {
      const s3Key = `${TENANT_ID}/${ENTITY_TYPE}/${ENTITY_ID}/some-uuid-${FILENAME}`;
      mocks.mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/presigned');

      await getPresignedUrl(s3Key);

      expect(mocks.mockGetSignedUrl).toHaveBeenCalledOnce();
      const cmd = mocks.mockGetSignedUrl.mock.calls[0][1];
      expect(cmd.input.Bucket).toBe('test-bucket');
      expect(cmd.input.Key).toBe(s3Key);
    });

    it('returns the presigned URL from getSignedUrl', async () => {
      const expected = 'https://s3.example.com/presigned?signature=abc';
      mocks.mockGetSignedUrl.mockResolvedValueOnce(expected);

      const result = await getPresignedUrl('some/key.pdf');
      expect(result).toBe(expected);
    });

    it('uses 1-hour expiry (3600 seconds)', async () => {
      mocks.mockGetSignedUrl.mockResolvedValueOnce('https://s3.example.com/presigned');

      await getPresignedUrl('some/key.pdf');

      const opts = mocks.mockGetSignedUrl.mock.calls[0][2];
      expect(opts.expiresIn).toBe(3600);
    });

    it('throws descriptively when env vars are missing', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      await expect(getPresignedUrl('some/key.pdf')).rejects.toThrow('AWS_ACCESS_KEY_ID');
    });
  });
});
