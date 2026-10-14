export type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado';

export interface MenuItem {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  activo: boolean;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
}

export interface Rider {
  id: string;
  nombre: string;
  telefono: string | null;
  activo: boolean;
}

export interface PedidoItem {
  id: string;
  itemNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Pedido {
  id: string;
  clienteNombre: string;
  nota: string | null;
  estado: EstadoPedido;
  total: number;
  createdAt: string;
  updatedAt: string;
  items: PedidoItem[];
  itemsTexto: string;
  riderId: string | null;
  riderNombre: string | null;
  costoDelivery: number;
}
