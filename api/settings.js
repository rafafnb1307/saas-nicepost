/**
 * GET /api/settings → preferências do System Prompt + regras invioláveis (somente leitura)
 * PUT /api/settings → atualiza preferências do usuário
 */
import { route, readJson, sendJson, HttpError } from './_lib/http.js';
import { requireUser, saveUser, DEFAULT_SETTINGS } from './_lib/users.js';
import { CORE_RULES, TONES, PLATFORM_GUIDES, buildSystemPrompt } from './_lib/prompt.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);

function sanitize(input) {
  const emojiLevel = ['none', 'moderate', 'high'].includes(input.emojiLevel) ? input.emojiLevel : 'moderate';
  const banned = Array.isArray(input.bannedPhrases)
    ? input.bannedPhrases
    : String(input.bannedPhrases || '').split(/[,\n]/);

  return {
    brandName: str(input.brandName, 80),
    brandVoice: str(input.brandVoice, 400),
    audience: str(input.audience, 300),
    emojiLevel,
    useHashtags: input.useHashtags !== false,
    bannedPhrases: [...new Set(banned.map((p) => str(p, 60).toLowerCase()).filter(Boolean))].slice(0, 40),
    customRules: str(input.customRules, 1500),
  };
}

const payload = (settings) => ({
  settings,
  coreRules: CORE_RULES,
  tones: TONES,
  platforms: Object.keys(PLATFORM_GUIDES),
  preview: buildSystemPrompt({ platform: 'LinkedIn', tone: TONES[0], settings }),
});

export default route({
  GET: async (req, res) => {
    const user = await requireUser(req);
    sendJson(res, 200, payload({ ...DEFAULT_SETTINGS, ...user.settings }));
  },
  PUT: async (req, res) => {
    const user = await requireUser(req);
    const body = await readJson(req);
    if (body?.reset === true) {
      user.settings = { ...DEFAULT_SETTINGS };
    } else {
      if (typeof body !== 'object' || !body) throw new HttpError(400, 'Dados inválidos.', 'invalid_settings');
      user.settings = sanitize(body);
    }
    await saveUser(user);
    sendJson(res, 200, payload(user.settings));
  },
});
