/**
 * Gerenciador de Sessão e Modal de Autenticação
 */
import { api } from './api.js';
import { showToast, renderIcons } from './ui.js';

class AuthManager {
  constructor() {
    this.user = null;
    this.listeners = new Set();
    this.activeTab = 'login';
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb(this.user));
    this.updateDom();
  }

  async checkSession() {
    const skeleton = document.getElementById('auth-skeleton');
    try {
      const res = await api.getSession();
      this.user = res?.user || null;
    } catch {
      this.user = null;
    } finally {
      if (skeleton) skeleton.hidden = true;
      this.notify();
    }
  }

  openModal(tab = 'login', plan = null) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    this.activeTab = tab;
    this.switchTab(tab);

    if (plan) {
      const planSelect = document.getElementById('auth-plan');
      if (planSelect) planSelect.value = plan;
    }

    // Código de indicação salvo na URL se houver
    const refCode = localStorage.getItem('nicepost_ref_code');
    const refHint = document.getElementById('auth-ref-hint');
    const refDisplay = document.getElementById('auth-ref-code');
    if (refCode && refHint && refDisplay) {
      refDisplay.textContent = refCode;
      refHint.hidden = false;
    }

    const err = document.getElementById('auth-error');
    if (err) err.hidden = true;

    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    document.getElementById('auth-email')?.focus();
  }

  closeModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    setTimeout(() => { modal.hidden = true; }, 240);
  }

  switchTab(tab) {
    this.activeTab = tab;
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    const planField = document.getElementById('auth-plan-field');
    const submitBtn = document.getElementById('btn-auth-submit');
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const tabsContainer = document.getElementById('auth-tabs');

    const isLogin = tab === 'login';

    if (tabLogin) tabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');
    if (tabReg) tabReg.setAttribute('aria-selected', isLogin ? 'false' : 'true');
    if (tabsContainer) tabsContainer.style.setProperty('--index', isLogin ? '0' : '1');

    if (planField) planField.hidden = isLogin;
    if (submitBtn) submitBtn.textContent = isLogin ? 'Entrar' : 'Criar minha conta';
    if (title) title.textContent = isLogin ? 'Acessar o NicePost' : 'Criar nova conta';
    if (subtitle) subtitle.textContent = isLogin ? 'Entre para continuar criando.' : 'Comece com 3 posts grátis no plano Trial.';
  }

  async handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = document.getElementById('btn-auth-submit');
    const errBox = document.getElementById('auth-error');
    const email = form.email.value.trim();
    const password = form.password.value;
    const plan = form.plan?.value || 'trial';
    const ref = localStorage.getItem('nicepost_ref_code') || undefined;

    if (errBox) errBox.hidden = true;
    submitBtn.classList.add('is-loading');

    try {
      let res;
      if (this.activeTab === 'login') {
        res = await api.login({ email, password });
        showToast('Login realizado com sucesso!');
      } else {
        res = await api.register({ email, password, plan, ref });
        showToast(`Conta criada! Seja bem-vindo ao NicePost.`);
      }

      this.user = res.user;
      this.closeModal();
      form.reset();
      this.notify();
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message || 'Falha ao autenticar.';
        errBox.hidden = false;
      }
    } finally {
      submitBtn.classList.remove('is-loading');
    }
  }

  async logout() {
    try {
      await api.logout();
      this.user = null;
      this.notify();
      showToast('Sessão encerrada com sucesso.');
      window.location.hash = '#/';
    } catch (err) {
      showToast('Erro ao encerrar sessão.', 'error');
    }
  }

  updateDom() {
    const btnOpenAuth = document.getElementById('btn-open-auth');
    const userMenu = document.getElementById('user-menu');
    const userEmail = document.getElementById('user-email');
    const userPlan = document.getElementById('user-plan');
    const userAvatar = document.getElementById('user-avatar');
    const userCredits = document.getElementById('user-credits');
    const userCreditsBar = document.getElementById('user-credits-bar');

    if (this.user) {
      if (btnOpenAuth) btnOpenAuth.hidden = true;
      if (userMenu) userMenu.hidden = false;

      if (userEmail) userEmail.textContent = this.user.email;
      if (userPlan) userPlan.textContent = (this.user.plan?.name || 'TRIAL').toUpperCase();
      if (userAvatar) userAvatar.textContent = this.user.email.charAt(0).toUpperCase();

      const { used = 0, limit = 3 } = this.user.usage || {};
      const remaining = Math.max(0, limit - used);
      if (userCredits) userCredits.textContent = `${remaining} / ${limit}`;
      if (userCreditsBar) {
        const pct = Math.min(100, (used / limit) * 100);
        userCreditsBar.style.width = `${pct}%`;
      }
    } else {
      if (btnOpenAuth) btnOpenAuth.hidden = false;
      if (userMenu) userMenu.hidden = true;
    }

    renderIcons();
  }

  init() {
    // Listeners do modal
    document.querySelectorAll('[data-action="open-auth"]').forEach(btn => {
      btn.addEventListener('click', () => this.openModal('login'));
    });

    document.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal());
    });

    document.getElementById('tab-login')?.addEventListener('click', () => this.switchTab('login'));
    document.getElementById('tab-register')?.addEventListener('click', () => this.switchTab('register'));

    const authForm = document.getElementById('auth-form');
    if (authForm) authForm.addEventListener('submit', (e) => this.handleSubmit(e));

    document.querySelectorAll('[data-action="logout"]').forEach(btn => {
      btn.addEventListener('click', () => this.logout());
    });

    // Toggle password
    const togglePass = document.getElementById('btn-toggle-password');
    const passInput = document.getElementById('auth-password');
    if (togglePass && passInput) {
      togglePass.addEventListener('click', () => {
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        const icon = togglePass.querySelector('i');
        if (icon) icon.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye');
        renderIcons(togglePass);
      });
    }

    // User menu dropdown toggle
    const trigger = document.getElementById('user-menu-trigger');
    const menu = document.getElementById('user-menu');
    if (trigger && menu) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.toggle('is-open');
        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      document.addEventListener('click', () => {
        if (menu.classList.contains('is-open')) {
          menu.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    this.checkSession();
  }
}

export const auth = new AuthManager();
