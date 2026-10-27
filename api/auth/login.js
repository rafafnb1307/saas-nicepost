/**
 * POST /api/auth/login
 * Body: { email, password }
 */
import { route, readJson, sendJson, HttpError } from '../_lib/http.js';
import { verifyPassword, setSessionCookie } from '../_lib/auth.js';
import { findUserByEmail, toPublicUser } from '../_lib/users.js';
import { assertAuthRateLimit, validateCredentials } from './_shared.js';

// Hash fictício para igualar o tempo de resposta quando o e-mail não existe (evita enumeração).
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86);

export default route({
  POST: async (req, res) => {
    await assertAuthRateLimit(req);
    const { email, password } = validateCredentials(await readJson(req));

    const user = await findUserByEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'E-mail ou senha incorretos.', 'invalid_credentials');

    setSessionCookie(req, res, user.id);
    sendJson(res, 200, { user: await toPublicUser(user) });
  },
});
