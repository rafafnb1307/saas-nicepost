# NicePost 🚀 — SaaS de Posts Inteligentes com Google Gemini

O **NicePost** é um SaaS completo e pronto para produção projetado para gerar posts de alta conversão para redes sociais (LinkedIn, Instagram, X/Twitter e Facebook) usando inteligência artificial multimodal (**Google Gemini API**).

Projetado com arquitetura limpa (**Clean Architecture**), separando totalmente o Front-End modular das Serverless Functions em Node.js prontas para deploy instantâneo na **Vercel**.

---

## 📁 Estrutura do Projeto

```text
nicepost/
├── .env.example              # Template de variáveis de ambiente
├── .gitignore                # Arquivos ignorados pelo Git (.env, node_modules)
├── package.json              # Dependências e scripts
├── vercel.json               # Configurações de rotas, funções e headers de segurança
│
├── api/                      # 🛡️ Back-End Serverless (Vercel Functions)
│   ├── _lib/                 # Módulos internos (privados, não viram rotas)
│   │   ├── auth.js           # Hash com scrypt + JWT HS256 em cookies HttpOnly
│   │   ├── config.js         # Leitura centralizada de variáveis de ambiente
│   │   ├── db.js             # Camada de persistência (Upstash Redis ou Memória)
│   │   ├── http.js           # Roteador, proteção CSRF e utilitários HTTP
│   │   ├── plans.js          # Catálogo e limites dos planos no servidor
│   │   ├── prompt.js         # Montagem do System Prompt em camadas
│   │   └── users.js          # Consumo, cotas atômicas e histórico
│   │
│   ├── auth/                 # Rotas de Autenticação
│   │   ├── _shared.js        # Validação de credenciais e rate limit
│   │   ├── login.js          # POST /api/auth/login
│   │   ├── register.js       # POST /api/auth/register
│   │   └── session.js        # GET/DELETE /api/auth/session
│   │
│   ├── billing.js            # GET/POST /api/billing (Troca de planos / checkout)
│   ├── generate.js           # POST /api/generate (Ponte segura com Gemini SDK via Streaming)
│   ├── health.js             # GET /api/health (Status dos serviços)
│   ├── history.js            # GET/DELETE /api/history (Histórico na nuvem)
│   ├── referrals.js          # GET/POST /api/referrals (Sistema de afiliados)
│   └── settings.js           # GET/PUT /api/settings (Customização do System Prompt)
│
├── public/                   # 🎨 Front-End (Estático, limpo e modular)
│   ├── css/
│   │   ├── base.css          # Design tokens, reset, tipografia e fundo ambiente
│   │   ├── components.css    # Botões, cards glass, badges, skeleton e toasts
│   │   ├── layout.css        # Header flutuante, menu do usuário e mobile tabbar
│   │   └── views.css         # Estilos da landing, estúdio, painel e afiliados
│   │
│   ├── js/
│   │   ├── api.js            # Cliente HTTP com parser de streaming NDJSON
│   │   ├── auth.js           # Controle reativo de autenticação e sessão
│   │   ├── main.js           # Bootstrap da aplicação e micro-animações
│   │   ├── router.js         # Roteador SPA com proteção de rotas
│   │   ├── ui.js             # Toasts, área de transferência e spotlights
│   │   └── views.js          # Lógica do Estúdio, Dashboard e Configurações
│   │
│   ├── favicon.svg           # Ícone vetorial do aplicativo
│   └── index.html            # Shell HTML semântico com todas as views
│
└── scripts/
    ├── dev-server.js         # Servidor local de desenvolvimento (emula a Vercel)
    └── smoke-test.js         # Teste de verificação de arquivos e integridade
```

---

## ⚙️ Variáveis de Ambiente (`.env`)

Crie um arquivo `.env` na raiz do projeto baseado no `.env.example`:

```bash
# Google Gemini API
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash

# Autenticação
JWT_SECRET=sua_chave_secreta_super_segura_aqui

# Persistência (Opcional em DEV, recomendado em Prod via Upstash)
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Aplicação
APP_URL=http://localhost:3000
ALLOW_SIMULATED_BILLING=true
```

> **Dica para gerar o JWT_SECRET:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
> ```

---

## 💻 Como Rodar Localmente

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acesse no seu navegador: `http://localhost:3000`

---

## 🚢 Instruções de Deploy na Vercel

### 1. Subir o Projeto para o GitHub
```bash
git init
git add .
git commit -m "feat: NicePost v2.0 - arquitetura serverless profissional"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/nicepost.git
git push -u origin main
```

### 2. Importar o Projeto na Vercel
1. Acesse o painel da [Vercel](https://vercel.com) e clique em **Add New...** → **Project**.
2. Conecte sua conta do GitHub e selecione o repositório `nicepost`.
3. Em **Framework Preset**, deixe como **Other** (o arquivo `vercel.json` cuidará de tudo).
4. No campo **Root Directory**, mantenha `./`.

### 3. Configurar as Variáveis de Ambiente na Vercel
Na seção **Environment Variables** durante a criação do projeto (ou em *Settings → Environment Variables*):
- `GEMINI_API_KEY`: Sua chave de API obtida no [Google AI Studio](https://aistudio.google.com/app/apikey).
- `JWT_SECRET`: A string aleatória gerada para assinar as sessões.
- `APP_URL`: O domínio fornecido pela Vercel (ex: `https://nicepost.vercel.app`).

### 4. Conectar Banco Redis (Opcional, 1 clique)
1. Na aba **Storage** do seu projeto na Vercel, clique em **Create Database** → **KV (Upstash Redis)**.
2. A Vercel conectará e preencherá automaticamente as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.

Clique em **Deploy** e sua aplicação estará online em menos de 1 minuto!
