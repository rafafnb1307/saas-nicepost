/**
 * Catálogo de planos — fonte única da verdade no servidor.
 * O front-end recebe isto via /api/auth/me e nunca define limites sozinho.
 */
export const PLANS = Object.freeze({
  trial: { id: 'trial', name: 'Trial', monthlyPosts: 3, priceCents: 0, paid: false },
  essential: { id: 'essential', name: 'Essential', monthlyPosts: 15, priceCents: 5999, paid: true },
  pro: { id: 'pro', name: 'Pro', monthlyPosts: 25, priceCents: 9999, paid: true },
  ultra: { id: 'ultra', name: 'Ultra', monthlyPosts: 50, priceCents: 11999, paid: true },
});

export const getPlan = (id) => PLANS[id] || PLANS.trial;

/** Chave do ciclo mensal corrente (UTC), ex: "2026-10". */
export const currentCycle = (date = new Date()) => date.toISOString().slice(0, 7);

/** Primeiro dia do próximo ciclo (ISO). */
export const nextCycleStart = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
