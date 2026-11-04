import { NextResponse } from 'next/server';
import { obtenerMenu } from '@/lib/graphql';

export async function GET() {
  try {
    const menu = await obtenerMenu();
    return NextResponse.json({ menu: menu.filter((item) => item.activo) });
  } catch (err) {
    console.error('menu error', err);
    return NextResponse.json({ error: 'No se pudo cargar el menú' }, { status: 502 });
  }
}
