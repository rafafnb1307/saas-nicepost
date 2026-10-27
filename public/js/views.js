/**
 * Lógica das Views do NicePost (Estúdio, Dashboard, Indicações e Configurações)
 */
import { api } from './api.js';
import { auth } from './auth.js';
import { showToast, copyToClipboard, renderIcons, escapeHtml } from './ui.js';

/* ==========================================================================
   1. ESTÚDIO CRIATIVO
   ========================================================================== */
export const studioView = {
  selectedImageBase64: null,
  selectedImageMime: null,
  isGenerating: false,
  lastGeneratedText: '',

  init() {
    const form = document.getElementById('generator-form');
    const promptInput = document.getElementById('prompt-input');
    const countDisplay = document.getElementById('prompt-count');
    const dropzone = document.getElementById('dropzone');
    const imageInput = document.getElementById('image-input');
    const btnRemoveImg = document.getElementById('btn-remove-image');
    const btnCopy = document.getElementById('btn-copy-output');
    const btnRegen = document.getElementById('btn-regenerate');

    // Contador de caracteres do prompt
    promptInput?.addEventListener('input', () => {
      if (countDisplay) countDisplay.textContent = `${promptInput.value.length} / 4000`;
    });

    // Sugestões rápidas
    document.getElementById('prompt-ideas')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn && promptInput) {
        promptInput.value = btn.getAttribute('data-idea');
        promptInput.focus();
        if (countDisplay) countDisplay.textContent = `${promptInput.value.length} / 4000`;
      }
    });

    // Upload de Imagem / Dropzone
    dropzone?.addEventListener('click', () => imageInput?.click());
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragging');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragging');
      if (e.dataTransfer.files?.[0]) this.handleImage(e.dataTransfer.files[0]);
    });

    imageInput?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) this.handleImage(e.target.files[0]);
    });

    btnRemoveImg?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearImage();
    });

    // Copiar post gerado
    btnCopy?.addEventListener('click', () => {
      if (this.lastGeneratedText) copyToClipboard(this.lastGeneratedText, 'Post copiado com sucesso!');
    });

    btnRegen?.addEventListener('click', () => {
      form?.dispatchEvent(new Event('submit'));
    });

    // Submissão do formulário
    form?.addEventListener('submit', (e) => this.handleSubmit(e));

    // Atalho de teclado (Ctrl + Enter)
    promptInput?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        form?.dispatchEvent(new Event('submit'));
      }
    });

    // Sincroniza avatar e autor do preview
    auth.onChange((user) => {
      if (user) {
        const previewName = document.getElementById('preview-name');
        const previewAvatar = document.getElementById('preview-avatar');
        if (previewName) previewName.textContent = user.email.split('@')[0];
        if (previewAvatar) previewAvatar.textContent = user.email.charAt(0).toUpperCase();
        this.updateCreditsUI(user);
      }
    });
  },

  handleImage(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Envie apenas arquivos de imagem válidos (PNG, JPG, WEBP).', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 10MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      this.selectedImageBase64 = dataUrl.split(',')[1];
      this.selectedImageMime = file.type;

      const preview = document.getElementById('image-preview');
      const meta = document.getElementById('image-meta');
      const emptyState = document.getElementById('dropzone-empty');
      const previewState = document.getElementById('dropzone-preview');

      if (preview) preview.src = dataUrl;
      if (meta) meta.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      if (emptyState) emptyState.hidden = true;
      if (previewState) previewState.hidden = false;
    };
    reader.readAsDataURL(file);
  },

  clearImage() {
    this.selectedImageBase64 = null;
    this.selectedImageMime = null;
    const input = document.getElementById('image-input');
    const emptyState = document.getElementById('dropzone-empty');
    const previewState = document.getElementById('dropzone-preview');

    if (input) input.value = '';
    if (emptyState) emptyState.hidden = false;
    if (previewState) previewState.hidden = true;
  },

  updateCreditsUI(user) {
    const studioVal = document.getElementById('studio-credits-value');
    const pill = document.getElementById('studio-credits');
    if (!user || !studioVal) return;

    const remaining = Math.max(0, (user.usage?.limit || 3) - (user.usage?.used || 0));
    studioVal.textContent = remaining;
    if (pill) pill.classList.toggle('is-low', remaining <= 1);
  },

  async handleSubmit(e) {
    e.preventDefault();
    if (this.isGenerating) return;

    const promptInput = document.getElementById('prompt-input');
    const prompt = promptInput?.value.trim();
    if (!prompt || prompt.length < 5) {
      showToast('Descreva a ideia do post com mais detalhes (mín. 5 letras).', 'error');
      promptInput?.focus();
      return;
    }

    const platform = document.querySelector('input[name="platform"]:checked')?.value || 'LinkedIn';
    const tone = document.querySelector('input[name="tone"]:checked')?.value || 'Profissional & Técnico';
    const image = this.selectedImageBase64 ? { mimeType: this.selectedImageMime, data: this.selectedImageBase64 } : null;

    // Elementos da UI
    const btnSubmit = document.getElementById('btn-generate');
    const btnRegen = document.getElementById('btn-regenerate');
    const btnCopy = document.getElementById('btn-copy-output');
    const statusDot = document.getElementById('output-status-dot');
    const statusText = document.getElementById('output-status');
    const emptyState = document.getElementById('output-empty');
    const skeleton = document.getElementById('output-skeleton');
    const outputText = document.getElementById('output-text');
    const charsDisplay = document.getElementById('output-chars');
    const modelDisplay = document.getElementById('output-model');
    const previewPlatform = document.getElementById('preview-platform');

    // Estado inicial de carregamento
    this.isGenerating = true;
    this.lastGeneratedText = '';
    btnSubmit?.classList.add('is-loading');
    if (btnRegen) btnRegen.disabled = true;
    if (btnCopy) btnCopy.disabled = true;

    statusDot?.setAttribute('data-state', 'loading');
    if (statusText) statusText.textContent = 'Gerando post com a IA...';
    if (previewPlatform) previewPlatform.textContent = `${platform} · gerando agora`;

    if (emptyState) emptyState.hidden = true;
    if (skeleton) skeleton.hidden = false;
    if (outputText) {
      outputText.textContent = '';
      outputText.classList.add('is-streaming');
    }

    try {
      await api.generatePost({
        prompt,
        platform,
        tone,
        image,
        onMeta: (meta) => {
          if (skeleton) skeleton.hidden = true;
          if (modelDisplay) modelDisplay.textContent = meta.mock ? 'Modo de Teste (Simulação)' : `Modelo: ${meta.model}`;
        },
        onDelta: (textChunk) => {
          this.lastGeneratedText += textChunk;
          if (outputText) outputText.textContent = this.lastGeneratedText;
          if (charsDisplay) charsDisplay.textContent = `${this.lastGeneratedText.length} caracteres`;
        },
        onDone: (doneEvt) => {
          this.isGenerating = false;
          btnSubmit?.classList.remove('is-loading');
          if (btnRegen) btnRegen.disabled = false;
          if (btnCopy) btnCopy.disabled = false;
          outputText?.classList.remove('is-streaming');

          statusDot?.setAttribute('data-state', 'done');
          if (statusText) statusText.textContent = 'Post pronto para publicação!';
          if (previewPlatform) previewPlatform.textContent = `${platform} · agora`;

          if (doneEvt.usage && auth.user) {
            auth.user.usage = doneEvt.usage;
            auth.notify();
          }

          showToast('Post gerado com sucesso!');
        },
        onError: (err) => {
          throw err;
        }
      });
    } catch (err) {
      this.isGenerating = false;
      btnSubmit?.classList.remove('is-loading');
      if (btnRegen) btnRegen.disabled = false;
      if (skeleton) skeleton.hidden = true;
      outputText?.classList.remove('is-streaming');

      statusDot?.setAttribute('data-state', 'error');
      if (statusText) statusText.textContent = 'Falha na geração';
      if (outputText) outputText.innerHTML = `<div class="output-error"><strong>Erro:</strong> ${escapeHtml(err.message)}</div>`;

      showToast(err.message || 'Erro ao gerar post.', 'error');
    }
  }
};

/* ==========================================================================
   2. DASHBOARD VIEW
   ========================================================================== */
export const dashboardView = {
  historyData: [],

  async render() {
    if (!auth.user) return;
    this.renderStats();
    await this.loadHistory();
    this.renderPlans();
  },

  renderStats() {
    const user = auth.user;
    if (!user) return;

    const planEl = document.getElementById('dash-plan');
    const priceEl = document.getElementById('dash-plan-price');
    const usageEl = document.getElementById('dash-usage');
    const resetEl = document.getElementById('dash-reset');
    const timeEl = document.getElementById('dash-time');
    const ring = document.getElementById('dash-ring');
    const ringLabel = document.getElementById('dash-ring-label');

    if (planEl) planEl.textContent = user.plan?.name || 'TRIAL';
    if (priceEl) priceEl.textContent = user.plan?.priceCents ? `R$ ${(user.plan.priceCents / 100).toFixed(2).replace('.', ',')}/mês` : 'Cortesia';

    const { used = 0, limit = 3 } = user.usage || {};
    if (usageEl) usageEl.textContent = `${used} / ${limit}`;

    const pct = Math.min(100, Math.round((used / limit) * 100)) || 0;
    if (ring) {
      ring.style.setProperty('--p', pct);
      ring.classList.toggle('is-full', pct >= 100);
    }
    if (ringLabel) ringLabel.textContent = `${pct}%`;

    if (timeEl) timeEl.textContent = `${used * 15} min`;
    if (resetEl) resetEl.textContent = `Renova em 1º do próximo mês`;
  },

  async loadHistory() {
    const list = document.getElementById('history-list');
    const charsTotal = document.getElementById('dash-chars');
    const topPlatform = document.getElementById('dash-top-platform');

    try {
      const res = await api.getHistory();
      this.historyData = res.items || [];

      let totalChars = 0;
      const platformCounts = {};

      this.historyData.forEach(p => {
        totalChars += (p.chars || p.content?.length || 0);
        platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1;
      });

      if (charsTotal) charsTotal.textContent = totalChars.toLocaleString('pt-BR');
      
      const top = Object.entries(platformCounts).sort((a,b) => b[1] - a[1])[0];
      if (topPlatform) topPlatform.textContent = top ? `Mais frequente: ${top[0]}` : 'Nenhum post';

      this.filterAndRenderHistory();
    } catch (err) {
      if (list) list.innerHTML = `<li class="empty"><p class="muted">Falha ao carregar histórico.</p></li>`;
    }
  },

  filterAndRenderHistory() {
    const list = document.getElementById('history-list');
    const searchVal = document.getElementById('history-search')?.value.toLowerCase().trim() || '';
    const filterPlatform = document.getElementById('history-filter')?.value || '';

    if (!list) return;

    const filtered = this.historyData.filter(item => {
      const matchSearch = !searchVal || item.content?.toLowerCase().includes(searchVal) || item.prompt?.toLowerCase().includes(searchVal);
      const matchPlatform = !filterPlatform || item.platform === filterPlatform;
      return matchSearch && matchPlatform;
    });

    if (filtered.length === 0) {
      list.innerHTML = `
        <li class="empty">
          <span class="icon-tile"><i data-lucide="inbox"></i></span>
          <p>Nenhum post encontrado no histórico.</p>
        </li>`;
      renderIcons(list);
      return;
    }

    list.innerHTML = filtered.map((item, i) => `
      <li class="history__item" data-id="${item.id}" style="--i: ${i}">
        <div class="history__icon"><i data-lucide="${this.getPlatformIcon(item.platform)}"></i></div>
        <div class="history__main">
          <strong class="history__text">${escapeHtml(item.content)}</strong>
          <span class="history__meta">${item.platform} · ${new Date(item.createdAt).toLocaleDateString('pt-BR')} · ${item.chars || item.content.length} caracteres</span>
        </div>
        <div class="history__actions">
          <button class="btn btn--sm btn--ghost" data-action="copy-item" title="Copiar"><i data-lucide="copy"></i></button>
        </div>
      </li>
    `).join('');

    renderIcons(list);

    // Eventos nos itens do histórico
    list.querySelectorAll('.history__item').forEach(el => {
      const id = el.getAttribute('data-id');
      const item = this.historyData.find(x => x.id === id);

      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="copy-item"]')) {
          e.stopPropagation();
          copyToClipboard(item.content, 'Post copiado!');
          return;
        }
        this.openPostModal(item);
      });
    });
  },

  openPostModal(post) {
    const modal = document.getElementById('post-modal');
    if (!modal || !post) return;

    document.getElementById('post-modal-meta').textContent = `${post.platform} · ${new Date(post.createdAt).toLocaleDateString('pt-BR')}`;
    document.getElementById('post-modal-prompt').textContent = `Briefing: "${post.prompt}"`;
    document.getElementById('post-modal-content').textContent = post.content;

    document.getElementById('btn-post-modal-copy').onclick = () => {
      copyToClipboard(post.content);
    };

    document.getElementById('btn-post-modal-reuse').onclick = () => {
      const promptInput = document.getElementById('prompt-input');
      if (promptInput) promptInput.value = post.prompt;
      modal.classList.remove('is-open');
      modal.hidden = true;
      window.location.hash = '#/studio';
    };

    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
  },

  renderPlans() {
    const container = document.getElementById('plan-switch');
    if (!container || !auth.user) return;

    const currentPlan = auth.user.plan?.id || 'trial';
    const plans = [
      { id: 'trial', name: 'Trial', posts: 3, price: 'Grátis' },
      { id: 'essential', name: 'Essential', posts: 15, price: 'R$ 59,99/mês' },
      { id: 'pro', name: 'Pro', posts: 25, price: 'R$ 99,99/mês' },
      { id: 'ultra', name: 'Ultra', posts: 50, price: 'R$ 119,99/mês' },
    ];

    container.innerHTML = plans.map(p => `
      <button class="plan-option ${p.id === currentPlan ? 'is-current' : ''}" data-change-plan="${p.id}">
        <strong>${p.name}</strong>
        <span>${p.posts} posts/mês</span>
        <span class="mono">${p.price}</span>
      </button>
    `).join('');

    container.querySelectorAll('[data-change-plan]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const target = btn.getAttribute('data-change-plan');
        try {
          const res = await api.changePlan(target);
          auth.user = res.user;
          auth.notify();
          this.renderStats();
          this.renderPlans();
          showToast(`Plano alterado para ${target.toUpperCase()} com sucesso!`);
        } catch (err) {
          showToast(err.message || 'Falha ao alterar plano.', 'error');
        }
      });
    });
  },

  getPlatformIcon(platform) {
    if (platform === 'LinkedIn') return 'linkedin';
    if (platform === 'Instagram') return 'instagram';
    if (platform === 'Twitter/X') return 'twitter';
    return 'facebook';
  },

  init() {
    document.getElementById('history-search')?.addEventListener('input', () => this.filterAndRenderHistory());
    document.getElementById('history-filter')?.addEventListener('change', () => this.filterAndRenderHistory());

    document.getElementById('btn-clear-history')?.addEventListener('click', async () => {
      if (!confirm('Deseja apagar todo o histórico de posts gerados?')) return;
      try {
        await api.clearHistory();
        this.historyData = [];
        this.filterAndRenderHistory();
        showToast('Histórico limpo com sucesso.');
      } catch (err) {
        showToast('Erro ao limpar histórico.', 'error');
      }
    });
  }
};

/* ==========================================================================
   3. INDICAÇÕES VIEW
   ========================================================================== */
export const referralsView = {
  async render() {
    if (!auth.user) return;
    try {
      const stats = await api.getReferrals();
      const linkEl = document.getElementById('ref-link');
      const clicksEl = document.getElementById('ref-clicks');
      const signupsEl = document.getElementById('ref-signups');
      const convEl = document.getElementById('ref-conversions');
      const earnedEl = document.getElementById('ref-earned');
      const rateEl = document.getElementById('ref-rate');
      const bonusPerEl = document.getElementById('ref-bonus-per');

      if (linkEl) linkEl.textContent = stats.link;
      if (clicksEl) clicksEl.textContent = stats.clicks;
      if (signupsEl) signupsEl.textContent = stats.signups;
      if (convEl) convEl.textContent = stats.conversions;
      if (earnedEl) earnedEl.textContent = `+${stats.bonusPosts}`;
      if (bonusPerEl) bonusPerEl.textContent = `+${stats.bonusPerConversion}`;

      const rate = stats.clicks > 0 ? Math.round((stats.conversions / stats.clicks) * 100) : 0;
      if (rateEl) rateEl.textContent = `${rate}% de conversão`;

      // Links sociais de compartilhamento
      const shareMsg = encodeURIComponent(`Crie posts profissionais para suas redes sociais com IA usando o NicePost: ${stats.link}`);
      document.getElementById('share-whatsapp')?.setAttribute('href', `https://api.whatsapp.com/send?text=${shareMsg}`);
      document.getElementById('share-linkedin')?.setAttribute('href', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(stats.link)}`);
      document.getElementById('share-x')?.setAttribute('href', `https://twitter.com/intent/tweet?text=${shareMsg}`);

      document.getElementById('btn-copy-ref')?.addEventListener('click', () => {
        copyToClipboard(stats.link, 'Link de indicação copiado!');
      });
    } catch (err) {
      showToast('Falha ao obter métricas de afiliados.', 'error');
    }
  }
};

/* ==========================================================================
   4. SYSTEM PROMPT & SEGURANÇA VIEW
   ========================================================================== */
export const settingsView = {
  bannedWords: [],

  async render() {
    if (!auth.user) return;
    await this.loadSettings();
    await this.loadHealth();
  },

  async loadSettings() {
    try {
      const data = await api.getSettings();
      const s = data.settings || {};

      document.getElementById('set-brand-name').value = s.brandName || '';
      document.getElementById('set-audience').value = s.audience || '';
      document.getElementById('set-brand-voice').value = s.brandVoice || '';
      document.getElementById('set-custom-rules').value = s.customRules || '';
      document.getElementById('set-hashtags').checked = s.useHashtags !== false;

      const emojiRadio = document.querySelector(`input[name="emojiLevel"][value="${s.emojiLevel || 'moderate'}"]`);
      if (emojiRadio) emojiRadio.checked = true;

      this.bannedWords = s.bannedPhrases || [];
      this.renderTags();

      // Regras invioláveis do servidor (read-only)
      const rulesList = document.getElementById('core-rules');
      if (rulesList && data.coreRules) {
        rulesList.innerHTML = data.coreRules.map(r => `<li>${escapeHtml(r)}</li>`).join('');
      }

      // Prévia do prompt construído
      const previewPre = document.getElementById('prompt-preview');
      if (previewPre) previewPre.textContent = data.preview || '';

    } catch (err) {
      showToast('Erro ao carregar diretrizes de segurança.', 'error');
    }
  },

  async loadHealth() {
    const list = document.getElementById('health-list');
    const badge = document.getElementById('health-badge');

    try {
      const h = await api.getHealth();
      if (badge) {
        badge.textContent = h.ok ? 'Servidor 100% Operacional' : 'Instabilidade';
        badge.className = `badge ${h.ok ? 'badge--ok' : 'badge--danger'}`;
      }

      if (list) {
        list.innerHTML = `
          <li><span><i data-lucide="cpu"></i>Motor Gemini</span><strong class="mono text-xs">${h.ai.configured ? 'Conectado (API Key Segura)' : 'Modo Mock'}</strong></li>
          <li><span><i data-lucide="database"></i>Banco / Sessões</span><strong class="mono text-xs">${h.storage === 'redis' ? 'Upstash Redis' : 'Memória Local'}</strong></li>
          <li><span><i data-lucide="key"></i>Assinatura de Sessões</span><strong class="mono text-xs">${h.auth.jwtConfigured ? 'JWT Ativo (HttpOnly)' : 'Chave Temporária'}</strong></li>
        `;
        renderIcons(list);
      }
    } catch {
      if (badge) badge.textContent = 'Indisponível';
    }
  },

  renderTags() {
    const container = document.getElementById('banned-tags');
    const input = document.getElementById('set-banned');
    if (!container || !input) return;

    container.querySelectorAll('.tag').forEach(t => t.remove());

    this.bannedWords.forEach((word, idx) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `<span>${escapeHtml(word)}</span><button type="button" data-del="${idx}"><i data-lucide="x"></i></button>`;
      container.insertBefore(tag, input);
    });

    renderIcons(container);

    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = Number(btn.getAttribute('data-del'));
        this.bannedWords.splice(index, 1);
        this.renderTags();
      });
    });
  },

  init() {
    const form = document.getElementById('settings-form');
    const tagInputField = document.getElementById('set-banned');
    const resetBtn = document.getElementById('btn-reset-settings');
    const rulesInput = document.getElementById('set-custom-rules');
    const rulesCount = document.getElementById('rules-count');

    rulesInput?.addEventListener('input', () => {
      if (rulesCount) rulesCount.textContent = `${rulesInput.value.length} / 1500`;
    });

    tagInputField?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = tagInputField.value.replace(',', '').trim();
        if (val && !this.bannedWords.includes(val)) {
          this.bannedWords.push(val);
          this.renderTags();
          tagInputField.value = '';
        }
      }
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-save-settings');
      btn.classList.add('is-loading');

      const payload = {
        brandName: document.getElementById('set-brand-name')?.value,
        audience: document.getElementById('set-audience')?.value,
        brandVoice: document.getElementById('set-brand-voice')?.value,
        customRules: document.getElementById('set-custom-rules')?.value,
        useHashtags: document.getElementById('set-hashtags')?.checked,
        emojiLevel: document.querySelector('input[name="emojiLevel"]:checked')?.value || 'moderate',
        bannedPhrases: this.bannedWords
      };

      try {
        const res = await api.updateSettings(payload);
        const previewPre = document.getElementById('prompt-preview');
        if (previewPre) previewPre.textContent = res.preview || '';
        showToast('Diretrizes salvas com sucesso!');
      } catch (err) {
        showToast(err.message || 'Erro ao salvar configurações.', 'error');
      } finally {
        btn.classList.remove('is-loading');
      }
    });

    resetBtn?.addEventListener('click', async () => {
      if (!confirm('Deseja restaurar as diretrizes para os valores padrão?')) return;
      try {
        await api.updateSettings({ reset: true });
        await this.loadSettings();
        showToast('Diretrizes restauradas.');
      } catch (err) {
        showToast('Erro ao restaurar.', 'error');
      }
    });
  }
};
