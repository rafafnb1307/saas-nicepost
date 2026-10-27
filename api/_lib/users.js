/**
 * Repositório de usuários, consumo mensal e indicações.
 *
 * Modelo de chaves no Redis:
 *   user:{id}                    → objeto do usuário
 *   user:email:{email}           → id
 *   ref:code:{code}              → id do dono do código
 *   ref:{id}:clicks|signups|conversions → contadores
 *   usage:{id}:{YYYY-MM}         → posts consumidos no ciclo
 *   history:{id}                 → lista (LPUSH) dos últimos posts
 *   rl:{id}:{minuto}             → rate limit
 */
import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';
import { HttpError } from './http.js';
import { getSessionUserId } from './auth.js';
import { getPlan, currentCycle, nextCycleStart } from './plans.js';

export const DEFAULT_SETTINGS = Object.freeze({
  brandName: '',
  brandVoice: '',
  audience: '',
  emojiLevel: 'moderate', // none | moderate | high
  useHashtags: true,
  bannedPhrases: [
    'no mundo de hoje',
    'cada vez mais',
    'game changer',
    'revolucionário',
    'jornada',
    'desbloqueie seu potencial',
  ],
  customRules: '',
});

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function generateRefCode() {
  return crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').toUpperCase().slice(0, 7);
}

export async function findUserByEmail(email) {
  const id = await db.get(`user:email:${normalizeEmail(email)}`);
  return id ? db.get(`user:${id}`) : null;
}

export const getUser = (id) => db.get(`user:${id}`);
export const saveUser = (user) => db.set(`user:${user.id}`, user);

export async function createUser({ email, passwordHash, plan = 'trial', referredByCode }) {
  const normalized = normalizeEmail(email);
  const id = crypto.randomUUID();

  // Reserva o e-mail atomicamente (evita contas duplicadas em corrida).
  const reserved = await db.set(`user:email:${normalized}`, id, { nx: true });
  if (!reserved) throw new HttpError(409, 'Este e-mail já está cadastrado.', 'email_taken');

  let refCode;
  for (let i = 0; i < 5; i++) {
    const candidate = generateRefCode();
    if (await db.set(`ref:code:${candidate}`, id, { nx: true })) {
      refCode = candidate;
      break;
    }
  }

  let referredBy = null;
  if (referredByCode) {
    const ownerId = await db.get(`ref:code:${String(referredByCode).toUpperCase()}`);
    if (ownerId && ownerId !== id) {
      referredBy = ownerId;
      await db.incr(`ref:${ownerId}:signups`);
    }
  }

  const user = {
    id,
    email: normalized,
    passwordHash,
    plan: getPlan(plan).id,
    refCode,
    referredBy,
    referralRewarded: false,
    bonusPosts: 0,
    settings: { ...DEFAULT_SETTINGS },
    createdAt: new Date().toISOString(),
  };
  await saveUser(user);
  return user;
}

/** Garante sessão válida e retorna o usuário completo. */
export async function requireUser(req) {
  const id = getSessionUserId(req);
  if (!id) throw new HttpError(401, 'Faça login para continuar.', 'unauthorized');
  const user = await getUser(id);
  if (!user) throw new HttpError(401, 'Sessão inválida. Entre novamente.', 'unauthorized');
  return user;
}

// ---------------------------------------------------------------------------
// Consumo
// ---------------------------------------------------------------------------

const usageKey = (id) => `usage:${id}:${currentCycle()}`;

export async function getUsage(user) {
  const plan = getPlan(user.plan);
  const used = Number(await db.get(usageKey(user.id))) || 0;
  const limit = plan.monthlyPosts + (user.bonusPosts || 0);
  return { used, limit, remaining: Math.max(0, limit - used), resetsAt: nextCycleStart() };
}

/**
 * Reserva 1 crédito de forma atômica (INCR). Se estourar o limite, devolve.
 * Retorna função `release()` para estornar em caso de falha na geração.
 */
export async function reserveCredit(user) {
  const { limit } = await getUsage(user);
  const key = usageKey(user.id);
  const used = await db.incr(key);
  if (used === 1) await db.expire(key, 60 * 60 * 24 * 40);
  if (used > limit) {
    await db.incrby(key, -1);
    throw new HttpError(402, 'Você atingiu o limite de posts do seu plano. Faça upgrade para continuar.', 'quota_exceeded');
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await db.incrby(key, -1);
  };
}

export async function assertRateLimit(user) {
  const key = `rl:${user.id}:${Math.floor(Date.now() / 60000)}`;
  const count = await db.incr(key);
  if (count === 1) await db.expire(key, 70);
  if (count > config.app.rateLimitPerMinute) {
    throw new HttpError(429, 'Muitas gerações em sequência. Aguarde alguns segundos.', 'rate_limited');
  }
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

export async function addHistory(userId, entry) {
  await db.lpush(`history:${userId}`, entry);
  await db.ltrim(`history:${userId}`, 0, config.app.historyLimit - 1);
}

export const listHistory = (userId) => db.lrange(`history:${userId}`, 0, config.app.historyLimit - 1);
export const clearHistory = (userId) => db.del(`history:${userId}`);

// ---------------------------------------------------------------------------
// Indicações
// ---------------------------------------------------------------------------

export async function getReferralStats(user) {
  const [clicks, signups, conversions] = await Promise.all(
    ['clicks', 'signups', 'conversions'].map(async (k) => Number(await db.get(`ref:${user.id}:${k}`)) || 0),
  );
  return {
    code: user.refCode,
    clicks,
    signups,
    conversions,
    bonusPosts: user.bonusPosts || 0,
    bonusPerConversion: config.app.referralBonusPosts,
  };
}

/** Chamado quando um usuário indicado assina um plano pago pela primeira vez. */
export async function rewardReferrer(user) {
  if (!user.referredBy || user.referralRewarded) return;
  const referrer = await getUser(user.referredBy);
  if (!referrer) return;
  referrer.bonusPosts = (referrer.bonusPosts || 0) + config.app.referralBonusPosts;
  await saveUser(referrer);
  await db.incr(`ref:${referrer.id}:conversions`);
  user.referralRewarded = true;
}

// ---------------------------------------------------------------------------
// Serialização segura (nunca envia passwordHash)
// ---------------------------------------------------------------------------

export async function toPublicUser(user) {
  const plan = getPlan(user.plan);
  return {
    id: user.id,
    email: user.email,
    plan: { id: plan.id, name: plan.name, monthlyPosts: plan.monthlyPosts, priceCents: plan.priceCents },
    refCode: user.refCode,
    usage: await getUsage(user),
    createdAt: user.createdAt,
  };
}
