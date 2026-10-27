/**
 * NicePost — Ponto de Entrada Front-End (Main Application Bootstrap)
 */
import { router } from './router.js';
import { auth } from './auth.js';
import { api } from './api.js';
import { studioView, dashboardView, referralsView, settingsView } from './views.js';
import { initSpotlights, initRevealObserver, renderIcons } from './ui.js';

window.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializa o observador do ano atual
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // 2. Captura parâmetro de indicação (?ref=XYZ) na URL
  const urlParams = new URLSearchParams(window.location.search);
  const refParam = urlParams.get('ref');
  if (refParam) {
    localStorage.setItem('nicepost_ref_code', refParam.toUpperCase());
    api.recordReferralClick(refParam).catch(() => {});
  }

  // 3. Efeito do Header Glass ao rolar a página
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 15);
  }, { passive: true });

  // 4. Efeito de digitação no Mockup Hero da Landing Page
  initHeroMockup();

  // 5. Inicializa módulos e controladores
  initSpotlights();
  initRevealObserver();
  studioView.init();
  dashboardView.init();
  settingsView.init();
  auth.init();

  // 6. Registro de Rotas da SPA
  router.register('landing', () => {
    renderIcons();
  });

  router.register('studio', () => {
    if (auth.user) studioView.updateCreditsUI(auth.user);
    renderIcons();
  }, true);

  router.register('dashboard', async () => {
    await dashboardView.render();
    renderIcons();
  }, true);

  router.register('referrals', async () => {
    await referralsView.render();
    renderIcons();
  }, true);

  router.register('settings', async () => {
    await settingsView.render();
    renderIcons();
  }, true);

  // 7. Eventos globais da landing page
  document.querySelectorAll('[data-action="scroll-pricing"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      router.navigate('landing');
      setTimeout(() => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    });
  });

  document.querySelectorAll('[data-action="select-plan"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.getAttribute('data-plan');
      if (!auth.user) {
        auth.openModal('register', plan);
      } else {
        router.navigate('dashboard');
      }
    });
  });

  // 8. Inicializa navegação
  router.init();
  renderIcons();
});

function initHeroMockup() {
  const typedEl = document.getElementById('hero-typed');
  if (!typedEl) return;

  const sample = `Você não perde clientes por falta de recursos técnicos.
Você perde porque ninguém responde com empatia quando tudo dá errado.

No B2B, produto atrai o lead, mas o suporte humanizado é o que realmente multiplica o LTV.

💡 3 atitudes que mudam o jogo:
1. Menos scripts engessados, mais escuta ativa
2. Resolver antes de justificar
3. Acompanhamento pós-incidente

Como o seu time lida com o primeiro ticket crítico? 👇

#SaaS #CustomerSuccess #LTV #B2B`;

  let i = 0;
  function typeChar() {
    if (i < sample.length) {
      typedEl.textContent += sample[i];
      i++;
      setTimeout(typeChar, 22);
    }
  }

  // Inicia após pequeno delay visual
  setTimeout(typeChar, 700);
}
