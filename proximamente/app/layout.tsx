import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'La Parrilla del DT — Muy pronto',
  description: 'La Parrilla del DT está por llegar. Mientras tanto, juega con nuestro repartidor.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
