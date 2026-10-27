/**
 * Roteamento baseado em hash (#/studio, #/dashboard, etc) com proteção de rotas.
 */
import { auth } from './auth.js';

class Router {
  constructor() {
    this.routes = {};
    this.currentView = 'landing';
  }

  register(route, handler, isProtected = false) {
    this.routes[route] = { handler, isProtected };
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRouting());
    this.handleRouting();
  }

  navigate(route) {
    window.location.hash = `#/${route === 'landing' ? '' : route}`;
  }

  async handleRouting() {
    const rawHash = window.location.hash.slice(2).replace(/\/$/, '');
    const route = rawHash || 'landing';

    const match = this.routes[route] || this.routes['landing'];
    if (match.isProtected && !auth.user) {
      auth.openModal('login');
      // Não redireciona hash de imediato, aguarda autenticação
      return;
    }

    this.currentView = route;
    this.updateActiveViews(route);
    await match.handler();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateActiveViews(activeRoute) {
    // Esconde todas e exibe a ativa
    document.querySelectorAll('.view').forEach(view => {
      const viewName = view.getAttribute('data-view');
      view.hidden = viewName !== activeRoute;
    });

    // Atualiza classes ativas de navegação desktop e mobile
    document.querySelectorAll('[data-route]').forEach(link => {
      const target = link.getAttribute('data-route');
      const isActive = target === activeRoute;
      link.classList.toggle('is-active', isActive);
    });

    // Animação da pílula do header no desktop
    const activeLink = document.querySelector(`.nav a[data-route="${activeRoute}"]`);
    const indicator = document.querySelector('.nav__indicator');
    if (activeLink && indicator) {
      indicator.style.opacity = '1';
      indicator.style.width = `${activeLink.offsetWidth}px`;
      indicator.style.transform = `translateX(${activeLink.offsetLeft}px)`;
    } else if (indicator) {
      indicator.style.opacity = '0';
    }
  }
}

export const router = new Router();
