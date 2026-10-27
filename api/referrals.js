/**
 * GET  /api/referrals → estatísticas e link do usuário logado
 * POST /api/referrals → registra um clique em um link de indicação (público)
 *                       Body: { code }
 */
import { route, readJson, sendJson, parseCookies, serializeCookie, isSecureRequest } from './_lib/http.js';
import { requireUser, getReferralStats } from './_lib/users.js';
import { db } from './_lib/db.js';
import { config } from './_lib/config.js';

function baseUrl(req) {
  if (config.app.url) return config.app.url;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

export default route({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const stats = await getReferralStats(user);
    sendJson(res, 200, { ...stats, link: `${baseUrl(req)}/?ref=${stats.code}` });
  },

  POST: async (req, res) => {
    const code = String((await readJson(req)).code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    const ownerId = code && (await db.get(`ref:code:${code}`));
    if (!ownerId) return sendJson(res, 200, { ok: false });

    // Conta no máximo 1 clique por navegador a cada 24h para o mesmo código.
    const cookieName = `np_ref_${code}`;
    if (!parseCookies(req)[cookieName]) {
      await db.incr(`ref:${ownerId}:clicks`);
      res.setHeader(
        'Set-Cookie',
        serializeCookie(cookieName, '1', { maxAge: 86400, secure: isSecureRequest(req) }),
      );
    }
    sendJson(res, 200, { ok: true });
  },
});
