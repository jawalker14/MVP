import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

let _client: S3Client | null = null
function getClient(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
  return _client
}

export async function uploadLogo(
  userId: string,
  buffer: Buffer,
  mimeType: 'image/png' | 'image/jpeg',
): Promise<string> {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  const key = `logos/${userId}/${randomUUID()}.${ext}`
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return `${process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, '')}/${key}`
}

export async function deleteLogo(url: string): Promise<void> {
  const base = process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, '')
  if (!url.startsWith(base + '/')) return
  const key = url.slice(base.length + 1)
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }))
  } catch (err) {
    console.warn('Logo delete failed (non-fatal):', err)
  }
}