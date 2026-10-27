/**
 * GET /api/health → status público dos serviços (sem expor segredos).
 */
import { route, sendJson } from './_lib/http.js';
import { config } from './_lib/config.js';
import { db } from './_lib/db.js';

export default route({
  GET: async (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      ai: {
        configured: Boolean(config.gemini.apiKey),
        mock: config.flags.mockAi,
        model: config.flags.mockAi ? 'mock' : config.gemini.model,
      },
      storage: db.driver, // "redis" | "memory"
      auth: { jwtConfigured: Boolean(config.auth.jwtSecret) },
      billing: { simulated: config.flags.simulatedBilling },
      time: new Date().toISOString(),
    });
  },
});
