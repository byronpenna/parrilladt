export const QUERY_MENU = `
  query { menu { id nombre categoria precio } }
`;

export const QUERY_CLIENTES = `
  query { clientes { id nombre telefono } }
`;

export const QUERY_PEDIDOS = `
  query Pedidos($soloActivos: Boolean) {
    pedidos(soloActivos: $soloActivos) {
      id
      clienteNombre
      nota
      estado
      total
      createdAt
      itemsTexto
    }
  }
`;

export const MUTATION_CREAR_PEDIDO = `
  mutation CrearPedido($clienteNombre: String!, $nota: String, $items: [ItemInput!]!) {
    crearPedido(clienteNombre: $clienteNombre, nota: $nota, items: $items) {
      id
    }
  }
`;

export const MUTATION_ACTUALIZAR_ESTADO = `
  mutation ActualizarEstado($id: ID!, $estado: EstadoPedido!) {
    actualizarEstado(id: $id, estado: $estado) {
      id
      estado
    }
  }
`;

export const MUTATION_AGREGAR_CLIENTE = `
  mutation AgregarCliente($nombre: String!, $telefono: String) {
    agregarCliente(nombre: $nombre, telefono: $telefono) {
      id
    }
  }
`;
