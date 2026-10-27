/**
 * Autenticação: hash de senha (scrypt) + JWT HS256 em cookie HttpOnly.
 * Implementado com `node:crypto` — zero dependências e sem token exposto ao JavaScript do navegador.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config, isProduction, isVercel } from './config.js';
import { HttpError, parseCookies, serializeCookie, isSecureRequest } from './http.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 64 };

// ---------------------------------------------------------------------------
// Senhas
// ---------------------------------------------------------------------------

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_PARAMS.keyLen, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, saltB64, hashB64] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64url'), expected.length, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// JWT (HS256)
// ---------------------------------------------------------------------------

let devSecret;
function getSecret() {
  if (config.auth.jwtSecret) return config.auth.jwtSecret;
  if (isVercel || isProduction) {
    throw new HttpError(500, 'Servidor sem JWT_SECRET configurado.', 'misconfigured');
  }
  if (!devSecret) {
    devSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[auth] JWT_SECRET ausente — usando segredo temporário (sessões caem ao reiniciar).');
  }
  return devSecret;
}

const b64url = (input) => Buffer.from(input).toString('base64url');

export function signJwt(payload, ttlSeconds = config.auth.ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const signature = crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token) {
  const [header, body, signature] = String(token || '').split('.');
  if (!header || !body || !signature) return null;

  const expected = crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  try {
    const { alg } = JSON.parse(Buffer.from(header, 'base64url').toString());
    if (alg !== 'HS256') return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sessão via cookie
// ---------------------------------------------------------------------------

export function setSessionCookie(req, res, userId) {
  const token = signJwt({ sub: userId });
  res.setHeader(
    'Set-Cookie',
    serializeCookie(config.auth.cookieName, token, {
      maxAge: config.auth.ttlSeconds,
      secure: isSecureRequest(req) || isProduction,
    }),
  );
}

export function clearSessionCookie(req, res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(config.auth.cookieName, '', { maxAge: 0, secure: isSecureRequest(req) || isProduction }),
  );
}

/** Retorna o userId da sessão ou null. */
export function getSessionUserId(req) {
  const token = parseCookies(req)[config.auth.cookieName];
  return verifyJwt(token)?.sub || null;
}
