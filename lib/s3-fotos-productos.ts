import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const REGION = process.env.FOTOS_BUCKET_REGION || 'us-east-1';
const BUCKET = process.env.FOTOS_BUCKET_NAME || 'pedidos-cancha-fotos-productos';

const s3Client = new S3Client({ region: REGION });

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function buildFotoKey(menuItemId: string, fileName: string) {
  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
  return `menu-item-${menuItemId}/${Date.now()}-${randomUUID()}.${ext}`;
}

export function buildQrKey(cuentaId: string, fileName: string) {
  const ext = (fileName.split('.').pop() || 'png').toLowerCase();
  return `cuentas-qr/${cuentaId}/${Date.now()}-${randomUUID()}.${ext}`;
}

export async function getFotoUploadUrl(key: string) {
  const ext = (key.split('.').pop() || 'jpg').toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });
  return { url, contentType };
}

export async function deleteFotoObject(key: string) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
