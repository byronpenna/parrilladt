export type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado';
export type MetodoPago = 'efectivo' | 'transferencia';

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

export interface PedidoEstadoEvento {
  estado: EstadoPedido;
  createdAt: string;
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
  metodoPago: MetodoPago;
  horaEntrega: string | null;
  historialEstados: PedidoEstadoEvento[];
  clienteLat: number | null;
  clienteLng: number | null;
  clienteDireccion: string | null;
  distanciaKm: number | null;
}

export interface ConfigNegocio {
  latitud: number;
  longitud: number;
  direccion: string | null;
}

export interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
  stockIdeal: number;
  activo: boolean;
  bajoMinimo: boolean;
}
