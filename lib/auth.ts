import { CognitoJwtVerifier } from 'aws-jwt-verify';

export const SESSION_COOKIE = 'session';

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID!,
});

export async function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    return await verifier.verify(token);
  } catch {
    return null;
  }
}
