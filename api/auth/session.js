/**
 * GET    /api/auth/session → usuário logado (ou 401)
 * DELETE /api/auth/session → logout (limpa o cookie)
 */
import { route, sendJson } from '../_lib/http.js';
import { clearSessionCookie } from '../_lib/auth.js';
import { requireUser, toPublicUser } from '../_lib/users.js';

export default route({
  GET: async (req, res) => {
    const user = await requireUser(req);
    sendJson(res, 200, { user: await toPublicUser(user) });
  },
  DELETE: async (req, res) => {
    clearSessionCookie(req, res);
    sendJson(res, 200, { ok: true });
  },
});
