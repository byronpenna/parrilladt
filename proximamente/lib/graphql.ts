import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Mismo Lambda de GraphQL que invoca el back-office (infra/lambda/graphql).
// Esta app es pública: solo expone las operaciones de lectura/escritura
// seguras para un desconocido (menú, crear pedido). Todo lo de
// administración (riders, clientes, estados, menuAdmin, etc.) vive
// exclusivamente en el back-office y no tiene función equivalente aquí.
const lambdaClient = new LambdaClient({ region: process.env.GRAPHQL_LAMBDA_REGION || 'us-east-1' });
const FUNCTION_NAME = process.env.GRAPHQL_LAMBDA_NAME || 'pedidos-cancha-graphql';

async function invocarGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const command = new InvokeCommand({
    FunctionName: FUNCTION_NAME,
    Payload: Buffer.from(JSON.stringify({ query, variables })),
  });

  const res = await lambdaClient.send(command);
  const payload = res.Payload ? Buffer.from(res.Payload).toString('utf-8') : '{}';

  if (res.FunctionError) {
    throw new Error(`Error del Lambda de GraphQL: ${payload}`);
  }

  const body = JSON.parse(payload);
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message || 'Error de GraphQL');
  }
  return body.data as T;
}

export type MenuItem = {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  activo: boolean;
};

export async function obtenerMenu(): Promise<MenuItem[]> {
  const data = await invocarGraphQL<{ menu: MenuItem[] }>(`
    query { menu { id nombre categoria precio activo } }
  `);
  return data.menu;
}

export type ItemPedidoInput = {
  menuItemId?: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
};

export type CrearPedidoInput = {
  clienteNombre: string;
  nota?: string;
  metodoPago?: 'efectivo' | 'transferencia';
  items: ItemPedidoInput[];
  clienteLat?: number;
  clienteLng?: number;
  clienteDireccion?: string;
};

export type Pedido = {
  id: string;
  estado: string;
  total: number;
};

// Lista para cuando exista la pantalla de pedido público. No se expone
// todavía por HTTP: antes de aceptar pedidos anónimos de internet hace
// falta decidir límite de intentos / verificación, para no dejar un
// mutation público sin protección contra abuso.
export async function crearPedidoPublico(input: CrearPedidoInput): Promise<Pedido> {
  const data = await invocarGraphQL<{ crearPedido: Pedido }>(
    `
    mutation Crear(
      $clienteNombre: String!
      $nota: String
      $metodoPago: MetodoPago
      $items: [ItemInput!]!
      $clienteLat: Float
      $clienteLng: Float
      $clienteDireccion: String
    ) {
      crearPedido(
        clienteNombre: $clienteNombre
        nota: $nota
        metodoPago: $metodoPago
        items: $items
        clienteLat: $clienteLat
        clienteLng: $clienteLng
        clienteDireccion: $clienteDireccion
      ) {
        id
        estado
        total
      }
    }
  `,
    input
  );
  return data.crearPedido;
}
