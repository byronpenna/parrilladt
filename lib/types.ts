export type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado';

export interface MenuItem {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
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
}
