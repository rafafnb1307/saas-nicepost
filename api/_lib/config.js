/**
 * Configuração central lida de process.env.
 * Nada aqui é enviado ao navegador — este módulo só roda no servidor.
 */

const env = process.env;

/** true quando rodando em produção na Vercel (ou NODE_ENV=production). */
export const isProduction = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';

/** true quando rodando em qualquer ambiente Vercel (preview ou produção). */
export const isVercel = Boolean(env.VERCEL);

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = Object.freeze({
  gemini: {
    apiKey: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    temperature: Math.min(2, Math.max(0, Number(env.GEMINI_TEMPERATURE ?? 0.85))),
    maxOutputTokens: num(env.GEMINI_MAX_OUTPUT_TOKENS, 2048),
  },
  auth: {
    jwtSecret: env.JWT_SECRET || '',
    ttlSeconds: num(env.JWT_EXPIRES_IN_SECONDS, 60 * 60 * 24 * 7),
    cookieName: 'np_session',
  },
  redis: {
    url: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '',
    token: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '',
  },
  app: {
    url: (env.APP_URL || '').replace(/\/$/, ''),
    rateLimitPerMinute: num(env.RATE_LIMIT_PER_MINUTE, 6),
    referralBonusPosts: num(env.REFERRAL_BONUS_POSTS, 5),
    historyLimit: 100,
  },
  flags: {
    /** Mock automático em DEV quando não há chave; em produção só se explicitamente pedido. */
    mockAi: env.MOCK_AI === 'true' || (!env.GEMINI_API_KEY && !isVercel && !isProduction),
    simulatedBilling: env.ALLOW_SIMULATED_BILLING !== 'false',
  },
});
