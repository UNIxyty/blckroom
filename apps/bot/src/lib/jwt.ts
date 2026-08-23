import { SignJWT, jwtVerify } from "jose";

export interface SessionClaims {
  sub: string; // user id
  tg: string; // telegram id
}

const TTL = "15m";

export async function signSessionJwt(
  claims: SessionClaims,
  secret: string,
): Promise<string> {
  return new SignJWT({ tg: claims.tg })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(new TextEncoder().encode(secret));
}

export async function verifySessionJwt(
  token: string,
  secret: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.tg !== "string") return null;
    return { sub: payload.sub, tg: payload.tg };
  } catch {
    return null;
  }
}
