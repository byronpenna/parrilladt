export const QUERY_MENU = `
  query { menu { id nombre categoria precio activo } }
`;

export const QUERY_MENU_ADMIN = `
  query { menuAdmin { id nombre categoria precio activo } }
`;

export const QUERY_CLIENTES = `
  query { clientes { id nombre telefono } }
`;

export const QUERY_RIDERS = `
  query { riders { id nombre telefono activo } }
`;

export const QUERY_RIDERS_ADMIN = `
  query { ridersAdmin { id nombre telefono activo } }
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
      riderNombre
      costoDelivery
      metodoPago
    }
  }
`;

export const MUTATION_CREAR_PEDIDO = `
  mutation CrearPedido(
    $clienteNombre: String!
    $nota: String
    $riderId: ID
    $costoDelivery: Float
    $metodoPago: MetodoPago
    $items: [ItemInput!]!
  ) {
    crearPedido(
      clienteNombre: $clienteNombre
      nota: $nota
      riderId: $riderId
      costoDelivery: $costoDelivery
      metodoPago: $metodoPago
      items: $items
    ) {
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

export const MUTATION_CREAR_RIDER = `
  mutation CrearRider($nombre: String!, $telefono: String) {
    crearRider(nombre: $nombre, telefono: $telefono) {
      id nombre telefono activo
    }
  }
`;

export const MUTATION_ACTUALIZAR_RIDER = `
  mutation ActualizarRider($id: ID!, $nombre: String, $telefono: String, $activo: Boolean) {
    actualizarRider(id: $id, nombre: $nombre, telefono: $telefono, activo: $activo) {
      id nombre telefono activo
    }
  }
`;

export const MUTATION_ELIMINAR_RIDER = `
  mutation EliminarRider($id: ID!) {
    eliminarRider(id: $id)
  }
`;
