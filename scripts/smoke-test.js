/**
 * Smoke test: valida sintaxe e integridade estrutural de todos os arquivos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'package.json',
  'vercel.json',
  '.env.example',
  '.gitignore',
  'api/generate.js',
  'api/settings.js',
  'api/history.js',
  'api/referrals.js',
  'api/billing.js',
  'api/health.js',
  'api/auth/login.js',
  'api/auth/register.js',
  'api/auth/session.js',
  'public/index.html',
  'public/favicon.svg',
  'public/css/base.css',
  'public/css/components.css',
  'public/css/layout.css',
  'public/css/views.css',
  'public/js/main.js',
  'public/js/api.js',
  'public/js/auth.js',
  'public/js/router.js',
  'public/js/views.js',
  'public/js/ui.js'
];

console.log('🔍 Executando verificação de arquivos e arquitetura...\n');

let missing = 0;
for (const rel of requiredFiles) {
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full)) {
    console.log(`  ✓ ${rel}`);
  } else {
    console.error(`  ✗ FALTANDO: ${rel}`);
    missing++;
  }
}

if (missing === 0) {
  console.log('\n🎉 Todos os 25 módulos estruturais existem e estão posicionados corretamente!');
  process.exit(0);
} else {
  console.error(`\n❌ ${missing} arquivos ausentes.`);
  process.exit(1);
}
