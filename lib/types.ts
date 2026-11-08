export type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado';
export type MetodoPago = 'efectivo' | 'transferencia';

export interface MenuItem {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  activo: boolean;
  fotoPrincipalUrl: string | null;
}

export interface FotoMenuItem {
  id: string;
  menuItemId: string;
  key: string;
  url: string;
  principal: boolean;
  createdAt: string;
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
  motivo: string | null;
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
  motivoCancelacion: string | null;
  pagado: boolean;
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
  precioReferencia: number;
  activo: boolean;
  bajoMinimo: boolean;
}

export type TipoMovimientoInsumo = 'carga' | 'descarga';

export interface MovimientoInsumo {
  id: string;
  insumoId: string;
  tipo: TipoMovimientoInsumo;
  cantidad: number;
  precioUnitario: number;
  facturaKey: string | null;
  nota: string | null;
  createdAt: string;
}

export type TipoCuenta = 'efectivo' | 'banco';
export type EstadoCierreDia = 'abierto' | 'cerrado';

export interface Cuenta {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  activa: boolean;
  saldoActual: number;
  qrUrl: string | null;
}

export interface CierreCuentaDetalle {
  id: string;
  cuentaId: string;
  cuentaNombre: string;
  cuentaTipo: TipoCuenta;
  montoApertura: number;
  montoCierreReal: number | null;
}

export interface CierreDia {
  id: string;
  fecha: string;
  estado: EstadoCierreDia;
  abiertoEn: string;
  cerradoEn: string | null;
  notaApertura: string | null;
  notaCierre: string | null;
  ventasEfectivo: number | null;
  ventasTransferencia: number | null;
  ventasTotal: number | null;
  detalles: CierreCuentaDetalle[];
  diferenciaEfectivo: number | null;
  diferenciaBanco: number | null;
}
