/**
 * Helpers HTTP agnósticos de framework.
 * Usam apenas a API nativa do Node (req/res), então funcionam igual na
 * Vercel e no servidor local (scripts/dev-server.js).
 */

export class HttpError extends Error {
  /**
   * @param {number} status  Código HTTP
   * @param {string} message Mensagem segura para exibir ao usuário
   * @param {string} [code]  Código de erro estável para o front-end
   */
  constructor(status, message, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Responde JSON sem cache. */
export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

const MAX_BODY_BYTES = 4.4 * 1024 * 1024; // limite de payload da Vercel é 4.5MB

/** Lê o corpo JSON (usa req.body da Vercel quando existir). */
export async function readJson(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) {
    throw new HttpError(415, 'Content-Type deve ser application/json.', 'unsupported_media_type');
  }

  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    return safeParse(String(req.body));
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Payload muito grande.', 'payload_too_large');
    chunks.push(chunk);
  }
  return safeParse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON inválido.', 'invalid_json');
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
}

export function serializeCookie(name, value, { maxAge, httpOnly = true, secure, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function isSecureRequest(req) {
  return req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted);
}

/** Bloqueia requisições cross-site em métodos que alteram estado (defesa CSRF). */
function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return; // navegadores sempre enviam Origin em fetch POST; ferramentas CLI não
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Origem inválida.', 'bad_origin');
  }
  if (originHost !== host) throw new HttpError(403, 'Origem não permitida.', 'bad_origin');
}

/**
 * Cria um handler serverless com roteamento por método e tratamento de erros.
 * @param {Record<string, (req, res) => Promise<any>>} methods
 */
export function route(methods) {
  const allowed = Object.keys(methods);
  return async function handler(req, res) {
    try {
      const fn = methods[req.method];
      if (!fn) {
        res.setHeader('Allow', allowed.join(', '));
        throw new HttpError(405, 'Método não permitido.', 'method_not_allowed');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req);
      await fn(req, res);
    } catch (err) {
      if (res.headersSent) {
        console.error('[api] erro após headers enviados:', err);
        return res.end();
      }
      if (err instanceof HttpError) {
        return sendJson(res, err.status, { error: { code: err.code, message: err.message } });
      }
      console.error('[api] erro inesperado:', err);
      return sendJson(res, 500, { error: { code: 'internal', message: 'Erro interno. Tente novamente.' } });
    }
  };
}
