import type { MenuItem } from '@/lib/graphql';

export type { MenuItem };

export type ItemCarrito = {
  menuItemId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  fotoUrl: string | null;
};
