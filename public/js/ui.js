/**
 * Utilitários de Interface: Toasts, Modais, Clipboards, Efeitos visuais e Ícones.
 */

export function showToast(message, type = 'success') {
  const container = document.getElementById('toasts');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');

  const iconName = type === 'error' ? 'alert-circle' : 'check-circle-2';
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.classList.add('is-leaving');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

export function copyToClipboard(text, successMessage = 'Copiado para a área de transferência!') {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMessage);
  }).catch(() => {
    showToast('Falha ao copiar texto.', 'error');
  });
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function initSpotlights() {
  document.querySelectorAll('.card--spotlight').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mx', `${x}px`);
      card.style.setProperty('--my', `${y}px`);
    });
  });
}

export function initRevealObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

export function renderIcons(root = document) {
  if (window.lucide) {
    window.lucide.createIcons({ root });
  }
}
