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

  type MenuItem {
    id: ID!
    nombre: String!
    categoria: String!
    precio: Float!
    activo: Boolean!
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
  }

  type Query {
    menu: [MenuItem!]!
    menuAdmin: [MenuItem!]!
    clientes: [Cliente!]!
    riders: [Rider!]!
    ridersAdmin: [Rider!]!
    pedidos(soloActivos: Boolean): [Pedido!]!
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

  type Mutation {
    crearPedido(
      clienteNombre: String!
      nota: String
      riderId: ID
      costoDelivery: Float
      metodoPago: MetodoPago
      items: [ItemInput!]!
    ): Pedido!
    actualizarEstado(id: ID!, estado: EstadoPedido!): Pedido!
    actualizarPedido(id: ID!, riderId: ID, metodoPago: MetodoPago, horaEntrega: String): Pedido!
    agregarCliente(nombre: String!, telefono: String): Cliente!
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
    crearRider(nombre: String!, telefono: String): Rider!
    actualizarRider(id: ID!, nombre: String, telefono: String, activo: Boolean): Rider!
    eliminarRider(id: ID!): Boolean!
  }
`);
