import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { getFacturaViewUrl } from '@/lib/s3-facturas';

export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Sesión expirada, inicia sesión de nuevo' }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'Falta key' }, { status: 400 });
  }

  try {
    const url = await getFacturaViewUrl(key);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('factura-view error', err);
    return NextResponse.json({ error: 'No se pudo generar el enlace de la factura' }, { status: 502 });
  }
}
