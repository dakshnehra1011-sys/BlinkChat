export interface Env {
  DB: D1Database;
  MATCHMAKER: DurableObjectNamespace;
  SIGNALING: DurableObjectNamespace;
  JWT_SIGNING_SECRET: string;
  STUN_SERVERS?: string;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  METERED_DOMAIN?: string;
  METERED_API_KEY?: string;
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  exp: number;
  iat: number;
}
