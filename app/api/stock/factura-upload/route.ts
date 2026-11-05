import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { buildFacturaKey, getFacturaUploadUrl } from '@/lib/s3-facturas';

export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Sesión expirada, inicia sesión de nuevo' }, { status: 401 });
  }

  const { insumoId, fileName } = await req.json();
  if (!insumoId || !fileName) {
    return NextResponse.json({ error: 'Falta insumoId o fileName' }, { status: 400 });
  }

  try {
    const key = buildFacturaKey(String(insumoId), String(fileName));
    const uploadUrl = await getFacturaUploadUrl(key);
    return NextResponse.json({ uploadUrl, key });
  } catch (err) {
    console.error('factura-upload error', err);
    return NextResponse.json({ error: 'No se pudo preparar la subida de la factura' }, { status: 502 });
  }
}
