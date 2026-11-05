import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const REGION = process.env.FACTURAS_BUCKET_REGION || 'us-east-1';
const BUCKET = process.env.FACTURAS_BUCKET_NAME || 'pedidos-cancha-facturas-insumos';

const s3Client = new S3Client({ region: REGION });

export function buildFacturaKey(insumoId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `insumo-${insumoId}/${Date.now()}-${randomUUID()}-${safeName}`;
}

export async function getFacturaUploadUrl(key: string) {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: 'application/pdf' });
  return getSignedUrl(s3Client, command, { expiresIn: 300 });
}

export async function getFacturaViewUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: 300 });
}
