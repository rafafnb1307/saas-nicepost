/**
 * Cliente HTTP para a API do NicePost.
 * Faz requisições autenticadas por cookie HttpOnly e processa streaming NDJSON.
 */

export class ApiError extends Error {
  constructor(message, code = 'error', status = 500) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request(url, options = {}) {
  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };

  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, { credentials: 'same-origin', ...options, headers });
  
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error?.message || 'Erro na requisição.', data?.error?.code || 'request_failed', res.status);
  }

  return data;
}

export const api = {
  // Auth
  getSession: () => request('/api/auth/session'),
  login: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  logout: () => request('/api/auth/session', { method: 'DELETE' }),

  // History
  getHistory: () => request('/api/history'),
  clearHistory: () => request('/api/history', { method: 'DELETE' }),

  // Settings / Prompt
  getSettings: () => request('/api/settings'),
  updateSettings: (payload) => request('/api/settings', { method: 'PUT', body: payload }),

  // Referrals
  getReferrals: () => request('/api/referrals'),
  recordReferralClick: (code) => request('/api/referrals', { method: 'POST', body: { code } }),

  // Billing
  getPlans: () => request('/api/billing'),
  changePlan: (plan) => request('/api/billing', { method: 'POST', body: { plan } }),

  // Health
  getHealth: () => request('/api/health'),

  // Generation via Streaming NDJSON
  async generatePost({ prompt, platform, tone, image, onMeta, onDelta, onDone, onError }) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, platform, tone, image })
    });

    if (!res.ok && !res.headers.get('content-type')?.includes('application/x-ndjson')) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(errData?.error?.message || 'Falha ao conectar com o serviço de geração.', errData?.error?.code, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Mantém linha parcial

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'meta') onMeta?.(event);
          else if (event.type === 'delta') onDelta?.(event.text);
          else if (event.type === 'done') onDone?.(event);
          else if (event.type === 'error') {
            onError?.(new ApiError(event.message, event.code));
            return;
          }
        } catch (e) {
          console.warn('[ndjson] Erro ao parsear linha:', line, e);
        }
      }
    }
  }
};
