/**
 * POST /api/generate   (alias: /api/generate-post via vercel.json)
 *
 * Ponte segura entre o front-end e o Google Gemini.
 * - A GEMINI_API_KEY é lida apenas aqui (process.env) e nunca sai do servidor.
 * - Exige sessão válida, aplica rate limit e reserva 1 crédito atomicamente.
 * - Responde em streaming NDJSON (uma linha JSON por evento) para UX em tempo real:
 *     {"type":"meta","model":"...","mock":false}
 *     {"type":"delta","text":"..."}            (vários)
 *     {"type":"done","post":{...},"usage":{...}}
 *     {"type":"error","code":"...","message":"..."}
 *
 * Corpo esperado (application/json):
 * {
 *   "prompt":   "Ideia central do post",            // obrigatório, 5–4000 chars
 *   "platform": "LinkedIn|Instagram|Twitter/X|Facebook",
 *   "tone":     "Persuasivo & Vendedor",
 *   "image":    { "mimeType": "image/jpeg", "data": "<base64 sem prefixo>" } // opcional
 * }
 */
import crypto from 'node:crypto';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { config } from './_lib/config.js';
import { route, readJson, HttpError } from './_lib/http.js';
import { requireUser, reserveCredit, assertRateLimit, addHistory, getUsage } from './_lib/users.js';
import { buildSystemPrompt, buildUserPrompt, PLATFORM_GUIDES, TONES } from './_lib/prompt.js';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const MAX_IMAGE_BYTES = 3.2 * 1024 * 1024; // decodificado; cabe no limite de 4.5MB da Vercel

const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }));

/** Valida e normaliza a entrada. Lança HttpError(400) se algo estiver errado. */
function validate(body) {
  const prompt = String(body?.prompt || '').trim();
  if (prompt.length < 5) throw new HttpError(400, 'Descreva a ideia do post com pelo menos 5 caracteres.', 'invalid_prompt');
  if (prompt.length > 4000) throw new HttpError(400, 'O briefing pode ter no máximo 4.000 caracteres.', 'invalid_prompt');

  const platform = PLATFORM_GUIDES[body?.platform] ? body.platform : 'LinkedIn';
  const tone = TONES.includes(body?.tone) ? body.tone : TONES[0];

  let image = null;
  if (body?.image?.data) {
    const mimeType = String(body.image.mimeType || '').toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) throw new HttpError(400, 'Formato de imagem não suportado.', 'invalid_image');
    const data = String(body.image.data).replace(/^data:[^,]+,/, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(data)) throw new HttpError(400, 'Imagem corrompida.', 'invalid_image');
    if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES) {
      throw new HttpError(413, 'Imagem muito grande (máx. ~3MB após compressão).', 'image_too_large');
    }
    image = { mimeType, data };
  }

  return { prompt, platform, tone, image };
}

/** Gera texto via Gemini SDK, emitindo cada trecho por `onDelta`. */
async function streamFromGemini({ systemInstruction, userPrompt, image, onDelta }) {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({
    model: config.gemini.model,
    systemInstruction,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      temperature: config.gemini.temperature,
      maxOutputTokens: config.gemini.maxOutputTokens,
    },
  });

  const parts = [{ text: userPrompt }];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });

  const result = await model.generateContentStream({ contents: [{ role: 'user', parts }] });

  let full = '';
  for await (const chunk of result.stream) {
    let text = '';
    try {
      text = chunk.text();
    } catch {
      // chunk bloqueado pelo filtro de segurança — tratado após o loop
    }
    if (text) {
      full += text;
      onDelta(text);
    }
  }

  const response = await result.response;
  const finishReason = response.candidates?.[0]?.finishReason;
  if (!full.trim()) {
    const blocked = response.promptFeedback?.blockReason || finishReason === 'SAFETY';
    throw new HttpError(
      422,
      blocked
        ? 'O conteúdo foi bloqueado pelas diretrizes de segurança. Reformule o briefing.'
        : 'A IA não retornou conteúdo. Tente novamente.',
      blocked ? 'blocked' : 'empty_response',
    );
  }
  return { text: full, tokens: response.usageMetadata?.totalTokenCount ?? null };
}

/** Gerador simulado para desenvolvimento sem chave (MOCK_AI). */
async function streamMock({ prompt, platform, tone, image, onDelta }) {
  const text = [
    `🚀 ${prompt.split(/[.!?\n]/)[0].slice(0, 90)}`,
    '',
    `Esta é uma resposta simulada (MOCK_AI) para ${platform}, no tom "${tone}".`,
    image ? '📸 A imagem anexada seria analisada pelo Gemini para dar contexto visual ao texto.' : '',
    '',
    '💡 Três pontos que fazem diferença:',
    '1. Gancho claro na primeira linha',
    '2. Um exemplo concreto em vez de promessas vagas',
    '3. Chamada para ação simples e direta',
    '',
    'Configure GEMINI_API_KEY no .env para gerar posts reais. 👇',
    '',
    `#${platform.replace(/\W/g, '')} #NicePost #MarketingDigital`,
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n');

  for (const piece of text.match(/.{1,12}/gs)) {
    onDelta(piece);
    await new Promise((r) => setTimeout(r, 25));
  }
  return { text, tokens: null };
}

export default route({
  POST: async (req, res) => {
    const input = validate(await readJson(req));
    const user = await requireUser(req);

    if (!config.flags.mockAi && !config.gemini.apiKey) {
      throw new HttpError(503, 'Serviço de IA indisponível: GEMINI_API_KEY não configurada no servidor.', 'ai_unavailable');
    }

    await assertRateLimit(user);
    const release = await reserveCredit(user);

    // A partir daqui respondemos em streaming.
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const emit = (event) => res.write(`${JSON.stringify(event)}\n`);

    emit({ type: 'meta', model: config.flags.mockAi ? 'mock' : config.gemini.model, mock: config.flags.mockAi });

    try {
      const generator = config.flags.mockAi ? streamMock : streamFromGemini;
      const { text, tokens } = await generator({
        ...input,
        systemInstruction: buildSystemPrompt({ platform: input.platform, tone: input.tone, settings: user.settings }),
        userPrompt: buildUserPrompt({ prompt: input.prompt, hasImage: Boolean(input.image) }),
        onDelta: (delta) => emit({ type: 'delta', text: delta }),
      });

      const post = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        platform: input.platform,
        tone: input.tone,
        prompt: input.prompt.slice(0, 300),
        content: text.trim(),
        hadImage: Boolean(input.image),
        chars: text.trim().length,
        tokens,
      };
      await addHistory(user.id, post);

      emit({ type: 'done', post, usage: await getUsage(user) });
    } catch (err) {
      await release(); // falhou → devolve o crédito
      console.error('[generate] falha:', err?.message || err);
      const safe =
        err instanceof HttpError
          ? { code: err.code, message: err.message }
          : { code: 'ai_error', message: 'Falha ao gerar o post com a IA. Seu crédito foi devolvido.' };
      emit({ type: 'error', ...safe });
    } finally {
      res.end();
    }
  },
});
