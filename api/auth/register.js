/**
 * POST /api/auth/register
 * Body: { email, password, plan?, ref? }
 * Cria a conta, aplica código de indicação e inicia a sessão (cookie HttpOnly).
 */
import { route, readJson, sendJson, HttpError } from '../_lib/http.js';
import { hashPassword, setSessionCookie } from '../_lib/auth.js';
import { createUser, toPublicUser, rewardReferrer, saveUser } from '../_lib/users.js';
import { getPlan } from '../_lib/plans.js';
import { config } from '../_lib/config.js';
import { assertAuthRateLimit, validateCredentials } from './_shared.js';

export default route({
  POST: async (req, res) => {
    await assertAuthRateLimit(req);
    const body = await readJson(req);
    const { email, password } = validateCredentials(body);

    // Planos pagos só são aplicados direto no cadastro se o checkout simulado estiver ativo.
    const requested = getPlan(body.plan);
    if (requested.paid && !config.flags.simulatedBilling) {
      throw new HttpError(400, 'Conclua o pagamento para ativar um plano pago.', 'payment_required');
    }

    const user = await createUser({
      email,
      passwordHash: await hashPassword(password),
      plan: requested.id,
      referredByCode: typeof body.ref === 'string' ? body.ref.slice(0, 16) : undefined,
    });

    if (requested.paid) {
      await rewardReferrer(user);
      await saveUser(user);
    }

    setSessionCookie(req, res, user.id);
    sendJson(res, 201, { user: await toPublicUser(user) });
  },
});
