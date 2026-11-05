import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { buildFotoKey, getFotoUploadUrl } from '@/lib/s3-fotos-productos';

const EXTENSIONES_VALIDAS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Sesión expirada, inicia sesión de nuevo' }, { status: 401 });
  }

  const { menuItemId, fileName } = await req.json();
  if (!menuItemId || !fileName) {
    return NextResponse.json({ error: 'Falta menuItemId o fileName' }, { status: 400 });
  }
  const ext = String(fileName).split('.').pop()?.toLowerCase() || '';
  if (!EXTENSIONES_VALIDAS.includes(ext)) {
    return NextResponse.json({ error: 'Formato no soportado (usa jpg, png, webp o gif)' }, { status: 400 });
  }

  try {
    const key = buildFotoKey(String(menuItemId), String(fileName));
    const { url, contentType } = await getFotoUploadUrl(key);
    return NextResponse.json({ uploadUrl: url, key, contentType });
  } catch (err) {
    console.error('foto-upload error', err);
    return NextResponse.json({ error: 'No se pudo preparar la subida de la foto' }, { status: 502 });
  }
}
