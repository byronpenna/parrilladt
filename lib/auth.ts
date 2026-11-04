import { CognitoJwtVerifier } from 'aws-jwt-verify';

export const SESSION_COOKIE = 'session';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      tokenUse: 'id',
      clientId: process.env.COGNITO_CLIENT_ID!,
    });
  }
  return verifier;
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    return await getVerifier().verify(token);
  } catch {
    return null;
  }
}
