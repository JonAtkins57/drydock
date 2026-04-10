import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

function getConfig(): { accessKeyId: string; secretAccessKey: string; region: string; bucket: string } {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_BUCKET;

  if (!accessKeyId) throw new Error('AWS_ACCESS_KEY_ID environment variable is not set');
  if (!secretAccessKey) throw new Error('AWS_SECRET_ACCESS_KEY environment variable is not set');
  if (!region) throw new Error('AWS_REGION environment variable is not set');
  if (!bucket) throw new Error('S3_BUCKET environment variable is not set');

  return { accessKeyId, secretAccessKey, region, bucket };
}

function buildClient(region: string, accessKeyId: string, secretAccessKey: string): S3Client {
  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadFile(
  tenantId: string,
  entityType: string,
  entityId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const { accessKeyId, secretAccessKey, region, bucket } = getConfig();
  const client = buildClient(region, accessKeyId, secretAccessKey);

  const s3Key = `${tenantId}/${entityType}/${entityId}/${randomUUID()}-${filename}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return s3Key;
}

export async function getPresignedUrl(s3Key: string): Promise<string> {
  const { accessKeyId, secretAccessKey, region, bucket } = getConfig();
  const client = buildClient(region, accessKeyId, secretAccessKey);

  const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export async function deleteFile(s3Key: string): Promise<void> {
  const { accessKeyId, secretAccessKey, region, bucket } = getConfig();
  const client = buildClient(region, accessKeyId, secretAccessKey);

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
}
