import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { deleteFotoObject } from '@/lib/s3-fotos-productos';

export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Sesión expirada, inicia sesión de nuevo' }, { status: 401 });
  }

  const { key } = await req.json();
  if (!key) {
    return NextResponse.json({ error: 'Falta key' }, { status: 400 });
  }

  try {
    await deleteFotoObject(String(key));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('foto-delete error', err);
    return NextResponse.json({ error: 'No se pudo borrar la foto de S3' }, { status: 502 });
  }
}
