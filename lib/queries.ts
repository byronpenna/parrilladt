export const QUERY_MENU = `
  query { menu { id nombre categoria precio activo } }
`;

export const QUERY_MENU_ADMIN = `
  query { menuAdmin { id nombre categoria precio activo } }
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

export const MUTATION_CREAR_PRODUCTO = `
  mutation CrearProducto($nombre: String!, $categoria: String!, $precio: Float!) {
    crearProductoMenu(nombre: $nombre, categoria: $categoria, precio: $precio) {
      id nombre categoria precio activo
    }
  }
`;

export const MUTATION_ACTUALIZAR_PRODUCTO = `
  mutation ActualizarProducto($id: ID!, $nombre: String, $categoria: String, $precio: Float, $activo: Boolean) {
    actualizarProductoMenu(id: $id, nombre: $nombre, categoria: $categoria, precio: $precio, activo: $activo) {
      id nombre categoria precio activo
    }
  }
`;

export const MUTATION_ELIMINAR_PRODUCTO = `
  mutation EliminarProducto($id: ID!) {
    eliminarProductoMenu(id: $id)
  }
`;
