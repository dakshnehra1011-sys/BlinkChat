export interface Env {
  DB: D1Database;
  MATCHMAKER: DurableObjectNamespace;
  SIGNALING: DurableObjectNamespace;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  STUN_SERVERS?: string;
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  exp: number;
  iat: number;
}
