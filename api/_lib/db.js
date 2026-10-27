/**
 * Camada de persistência mínima (Key-Value + listas).
 *
 * - Produção: Redis via REST (Upstash / Vercel Marketplace). Sem dependências,
 *   apenas fetch — funciona em qualquer runtime serverless.
 * - Desenvolvimento: fallback em memória (dados somem ao reiniciar).
 *
 * Interface: get, set, del, incr, expire, lpush, lrange, ltrim.
 */
import { config, isVercel } from './config.js';

function createRedisRest({ url, token }) {
  async function command(...args) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(`Redis: ${data.error || res.status}`);
    return data.result;
  }

  return {
    driver: 'redis',
    async get(key) {
      const raw = await command('GET', key);
      return raw == null ? null : JSON.parse(raw);
    },
    async set(key, value, { ex, nx } = {}) {
      const args = ['SET', key, JSON.stringify(value)];
      if (ex) args.push('EX', ex);
      if (nx) args.push('NX');
      return (await command(...args)) === 'OK';
    },
    del: (key) => command('DEL', key),
    incr: (key) => command('INCR', key).then(Number),
    incrby: (key, n) => command('INCRBY', key, n).then(Number),
    expire: (key, seconds) => command('EXPIRE', key, seconds),
    lpush: (key, value) => command('LPUSH', key, JSON.stringify(value)),
    lrange: async (key, start, stop) => (await command('LRANGE', key, start, stop)).map((v) => JSON.parse(v)),
    ltrim: (key, start, stop) => command('LTRIM', key, start, stop),
  };
}

function createMemoryStore() {
  const data = new Map();
  const timers = new Map();
  const clone = (v) => (v == null ? null : structuredClone(v));

  const expire = (key, seconds) => {
    clearTimeout(timers.get(key));
    const t = setTimeout(() => data.delete(key), seconds * 1000);
    t.unref?.();
    timers.set(key, t);
    return 1;
  };

  return {
    driver: 'memory',
    async get(key) {
      return clone(data.get(key));
    },
    async set(key, value, { ex, nx } = {}) {
      if (nx && data.has(key)) return false;
      data.set(key, clone(value));
      if (ex) expire(key, ex);
      return true;
    },
    async del(key) {
      return data.delete(key) ? 1 : 0;
    },
    async incr(key) {
      return this.incrby(key, 1);
    },
    async incrby(key, n) {
      const next = (Number(data.get(key)) || 0) + n;
      data.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      return expire(key, seconds);
    },
    async lpush(key, value) {
      const list = data.get(key) || [];
      list.unshift(clone(value));
      data.set(key, list);
      return list.length;
    },
    async lrange(key, start, stop) {
      const list = data.get(key) || [];
      return clone(list.slice(start, stop === -1 ? undefined : stop + 1));
    },
    async ltrim(key, start, stop) {
      const list = data.get(key) || [];
      data.set(key, list.slice(start, stop === -1 ? undefined : stop + 1));
      return 'OK';
    },
  };
}

// Singleton reaproveitado entre invocações "quentes" da função.
const globalKey = Symbol.for('nicepost.db');
if (!globalThis[globalKey]) {
  const useRedis = Boolean(config.redis.url && config.redis.token);
  if (!useRedis && isVercel) {
    console.warn('[db] ⚠️  Redis não configurado na Vercel — usando memória volátil. Configure KV_REST_API_URL/TOKEN.');
  }
  globalThis[globalKey] = useRedis ? createRedisRest(config.redis) : createMemoryStore();
}

/** @type {ReturnType<typeof createMemoryStore>} */
export const db = globalThis[globalKey];
