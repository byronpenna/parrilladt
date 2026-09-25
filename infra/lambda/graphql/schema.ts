import { buildSchema } from 'graphql';

export const schema = buildSchema(`
  enum EstadoPedido {
    pendiente
    en_preparacion
    listo
    entregado
    cancelado
  }

  type MenuItem {
    id: ID!
    nombre: String!
    categoria: String!
    precio: Float!
  }

  type Cliente {
    id: ID!
    nombre: String!
    telefono: String
  }

  type PedidoItem {
    id: ID!
    itemNombre: String!
    cantidad: Int!
    precioUnitario: Float!
    subtotal: Float!
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
  }

  type Query {
    menu: [MenuItem!]!
    clientes: [Cliente!]!
    pedidos(soloActivos: Boolean): [Pedido!]!
  }

  input ItemInput {
    menuItemId: ID
    nombre: String!
    cantidad: Int!
    precioUnitario: Float!
  }

  type Mutation {
    crearPedido(clienteNombre: String!, nota: String, items: [ItemInput!]!): Pedido!
    actualizarEstado(id: ID!, estado: EstadoPedido!): Pedido!
    agregarCliente(nombre: String!, telefono: String): Cliente!
  }
`);
