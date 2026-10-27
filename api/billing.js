/**
 * POST /api/billing → troca de plano
 * Body: { plan: "essential" | "pro" | "ultra" | "trial" }
 *
 * ⚠️ Checkout SIMULADO (ALLOW_SIMULATED_BILLING=true). Para produção real,
 * substitua por uma Stripe Checkout Session e ative o plano apenas no webhook
 * `checkout.session.completed` (ver README → "Próximos passos").
 */
import { route, readJson, sendJson, HttpError } from './_lib/http.js';
import { requireUser, saveUser, rewardReferrer, toPublicUser } from './_lib/users.js';
import { PLANS } from './_lib/plans.js';
import { config } from './_lib/config.js';

export default route({
  GET: async (_req, res) => {
    sendJson(res, 200, { plans: Object.values(PLANS), simulated: config.flags.simulatedBilling });
  },

  POST: async (req, res) => {
    const user = await requireUser(req);
    const { plan } = await readJson(req);
    const target = PLANS[plan];
    if (!target) throw new HttpError(400, 'Plano inválido.', 'invalid_plan');
    if (!config.flags.simulatedBilling) {
      throw new HttpError(501, 'Pagamentos ainda não configurados.', 'billing_unavailable');
    }

    user.plan = target.id;
    if (target.paid) await rewardReferrer(user);
    await saveUser(user);

    sendJson(res, 200, { user: await toPublicUser(user) });
  },
});
