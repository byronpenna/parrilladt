import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Region del Lambda GraphQL (us-east-1), independiente del AWS_REGION que
// el runtime de hosting (Amplify SSR en us-east-2) pueda tener seteado.
const lambdaClient = new LambdaClient({ region: process.env.GRAPHQL_LAMBDA_REGION || 'us-east-1' });
const FUNCTION_NAME = process.env.GRAPHQL_LAMBDA_NAME || 'pedidos-cancha-graphql';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const command = new InvokeCommand({
    FunctionName: FUNCTION_NAME,
    Payload: Buffer.from(JSON.stringify({ query: body.query, variables: body.variables })),
  });

  try {
    const res = await lambdaClient.send(command);
    const payload = res.Payload ? Buffer.from(res.Payload).toString('utf-8') : '{}';

    if (res.FunctionError) {
      return NextResponse.json({ errors: [{ message: payload }] }, { status: 502 });
    }

    return new NextResponse(payload, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error invocando pedidos-cancha-graphql', err);
    return NextResponse.json(
      { errors: [{ message: 'No se pudo conectar con el backend' }] },
      { status: 502 }
    );
  }
}
