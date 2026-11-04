import { NextRequest, NextResponse } from 'next/server';
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SESSION_COOKIE } from '@/lib/auth';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION || 'us-east-1' });
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: 'Completa usuario y contraseña' }, { status: 400 });
  }

  try {
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    });
    const res = await cognitoClient.send(command);
    const idToken = res.AuthenticationResult?.IdToken;
    const expiresIn = res.AuthenticationResult?.ExpiresIn || 3600;

    if (!idToken) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: expiresIn,
    });
    return response;
  } catch (err) {
    console.error('login error', err);
    return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 });
  }
}
