import { buildSchema } from 'graphql';

export const schema = buildSchema(`
  enum EstadoPedido {
    pendiente
    en_preparacion
    listo
    entregado
    cancelado
  }

  enum MetodoPago {
    efectivo
    transferencia
  }

  enum TipoCuenta {
    efectivo
    banco
  }

  enum EstadoCierreDia {
    abierto
    cerrado
  }

  type Cuenta {
    id: ID!
    nombre: String!
    tipo: TipoCuenta!
    activa: Boolean!
    saldoActual: Float!
    qrUrl: String
  }

  type CierreCuentaDetalle {
    id: ID!
    cuentaId: ID!
    cuentaNombre: String!
    cuentaTipo: TipoCuenta!
    montoApertura: Float!
    montoCierreReal: Float
  }

  type CierreDia {
    id: ID!
    fecha: String!
    estado: EstadoCierreDia!
    abiertoEn: String!
    cerradoEn: String
    notaApertura: String
    notaCierre: String
    ventasEfectivo: Float
    ventasTransferencia: Float
    ventasTotal: Float
    detalles: [CierreCuentaDetalle!]!
    diferenciaEfectivo: Float
    diferenciaBanco: Float
  }

  type MenuItem {
    id: ID!
    nombre: String!
    categoria: String!
    precio: Float!
    activo: Boolean!
    fotoPrincipalUrl: String
  }

  type FotoMenuItem {
    id: ID!
    menuItemId: ID!
    key: String!
    url: String!
    principal: Boolean!
    createdAt: String!
  }

  type Cliente {
    id: ID!
    nombre: String!
    telefono: String
  }

  type Rider {
    id: ID!
    nombre: String!
    telefono: String
    activo: Boolean!
  }

  type PedidoItem {
    id: ID!
    itemNombre: String!
    cantidad: Int!
    precioUnitario: Float!
    subtotal: Float!
  }

  type PedidoEstadoEvento {
    estado: EstadoPedido!
    motivo: String
    createdAt: String!
  }

  type Pedido {
    id: ID!
    clienteNombre: String!
    nota: String
    estado: EstadoPedido!
    total: Float!
    createdAt: String!
    updatedAt: String!
    items: [PedidoItem!]!
    itemsTexto: String!
    riderId: ID
    riderNombre: String
    costoDelivery: Float!
    metodoPago: MetodoPago!
    horaEntrega: String
    historialEstados: [PedidoEstadoEvento!]!
    clienteLat: Float
    clienteLng: Float
    clienteDireccion: String
    distanciaKm: Float
    motivoCancelacion: String
    pagado: Boolean!
  }

  type ConfigNegocio {
    latitud: Float!
    longitud: Float!
    direccion: String
  }

  type Insumo {
    id: ID!
    nombre: String!
    unidad: String!
    stockActual: Float!
    stockMinimo: Float!
    stockIdeal: Float!
    precioReferencia: Float!
    activo: Boolean!
    bajoMinimo: Boolean!
  }

  enum TipoMovimientoInsumo {
    carga
    descarga
  }

  type MovimientoInsumo {
    id: ID!
    insumoId: ID!
    tipo: TipoMovimientoInsumo!
    cantidad: Float!
    precioUnitario: Float!
    facturaKey: String
    nota: String
    createdAt: String!
  }

  type Query {
    menu: [MenuItem!]!
    menuAdmin: [MenuItem!]!
    clientes: [Cliente!]!
    riders: [Rider!]!
    ridersAdmin: [Rider!]!
    pedidos(soloActivos: Boolean): [Pedido!]!
    configNegocio: ConfigNegocio
    insumos: [Insumo!]!
    fotosMenuItem(menuItemId: ID!): [FotoMenuItem!]!
    movimientosInsumo(insumoId: ID!): [MovimientoInsumo!]!
    cuentas: [Cuenta!]!
    cierresDia(limite: Int): [CierreDia!]!
    cierreDiaActual: CierreDia
  }

  input ItemInput {
    menuItemId: ID
    nombre: String!
    cantidad: Int!
    precioUnitario: Float!
  }

  input MenuItemInput {
    nombre: String!
    categoria: String!
    precio: Float!
  }

  input AperturaCuentaInput {
    cuentaId: ID!
    montoApertura: Float!
  }

  input CierreCuentaInput {
    cuentaId: ID!
    montoCierreReal: Float!
  }

  type Mutation {
    crearPedido(
      clienteNombre: String!
      nota: String
      riderId: ID
      costoDelivery: Float
      metodoPago: MetodoPago
      pagado: Boolean
      items: [ItemInput!]!
      clienteLat: Float
      clienteLng: Float
      clienteDireccion: String
    ): Pedido!
    actualizarEstado(id: ID!, estado: EstadoPedido!, motivo: String): Pedido!
    actualizarPedido(
      id: ID!
      riderId: ID
      metodoPago: MetodoPago
      pagado: Boolean
      horaEntrega: String
      costoDelivery: Float
      clienteLat: Float
      clienteLng: Float
      clienteDireccion: String
    ): Pedido!
    actualizarConfigNegocio(latitud: Float!, longitud: Float!, direccion: String): ConfigNegocio!
    agregarCliente(nombre: String!, telefono: String): Cliente!
    actualizarCliente(id: ID!, nombre: String, telefono: String): Cliente!
    eliminarCliente(id: ID!): Boolean!
    agregarProductosMenu(items: [MenuItemInput!]!): [MenuItem!]!
    crearProductoMenu(nombre: String!, categoria: String!, precio: Float!): MenuItem!
    actualizarProductoMenu(
      id: ID!
      nombre: String
      categoria: String
      precio: Float
      activo: Boolean
    ): MenuItem!
    eliminarProductoMenu(id: ID!): Boolean!
    agregarFotoMenuItem(menuItemId: ID!, key: String!, principal: Boolean): FotoMenuItem!
    marcarFotoPrincipal(id: ID!): FotoMenuItem!
    eliminarFotoMenuItem(id: ID!): Boolean!
    crearCuenta(nombre: String!, tipo: TipoCuenta!): Cuenta!
    actualizarCuenta(id: ID!, nombre: String, activa: Boolean, qrKey: String): Cuenta!
    abrirDia(aperturas: [AperturaCuentaInput!]!, nota: String): CierreDia!
    cerrarDia(cierreDiaId: ID!, cierres: [CierreCuentaInput!]!, nota: String): CierreDia!
    eliminarCierreDia(id: ID!): Boolean!
    crearRider(nombre: String!, telefono: String): Rider!
    actualizarRider(id: ID!, nombre: String, telefono: String, activo: Boolean): Rider!
    eliminarRider(id: ID!): Boolean!
    crearInsumo(
      nombre: String!
      unidad: String!
      stockMinimo: Float
      stockIdeal: Float
      precioReferencia: Float
    ): Insumo!
    actualizarInsumo(
      id: ID!
      nombre: String
      unidad: String
      stockMinimo: Float
      stockIdeal: Float
      precioReferencia: Float
      activo: Boolean
    ): Insumo!
    eliminarInsumo(id: ID!): Boolean!
    registrarMovimientoInsumo(
      insumoId: ID!
      tipo: TipoMovimientoInsumo!
      cantidad: Float!
      precioUnitario: Float
      facturaKey: String
      nota: String
    ): MovimientoInsumo!
  }
`);
