/**
 * Utilitários compartilhados pelas rotas de autenticação.
 * (Prefixo "_" → a Vercel não expõe este arquivo como endpoint.)
 */
import { db } from '../_lib/db.js';
import { HttpError } from '../_lib/http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCredentials(body) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Informe um e-mail válido.', 'invalid_email');
  if (password.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.', 'weak_password');
  if (password.length > 128) throw new HttpError(400, 'Senha muito longa.', 'invalid_password');
  return { email, password };
}

/** Limita tentativas de login/cadastro por IP (anti brute-force): 10/min. */
export async function assertAuthRateLimit(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = `rl:auth:${ip}:${Math.floor(Date.now() / 60000)}`;
  const count = await db.incr(key);
  if (count === 1) await db.expire(key, 70);
  if (count > 10) throw new HttpError(429, 'Muitas tentativas. Aguarde um minuto.', 'rate_limited');
}
