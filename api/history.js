/**
 * GET    /api/history → últimos posts do usuário (máx. 100)
 * DELETE /api/history → apaga o histórico
 */
import { route, sendJson } from './_lib/http.js';
import { requireUser, listHistory, clearHistory } from './_lib/users.js';

export default route({
  GET: async (req, res) => {
    const user = await requireUser(req);
    sendJson(res, 200, { items: await listHistory(user.id) });
  },
  DELETE: async (req, res) => {
    const user = await requireUser(req);
    await clearHistory(user.id);
    sendJson(res, 200, { ok: true });
  },
});
