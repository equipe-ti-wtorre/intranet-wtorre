# Intranet Corporativa · Grupo WTorre

Monorepo fullstack com **Angular 21** (frontend) e **Express + MySQL + JWT** (backend) para a intranet do Grupo WTorre (WTorre, Nubank Parque, Base Coworking e Novo Anhangabaú).

## Estrutura

```
intranet-wtorre/
├── frontend/          # Angular standalone, SCSS WTorre, MSAL v5
├── backend/           # API Express /api/v1
├── docs/reference/    # Notas sobre referência visual (componentes Angular)
└── README.md
```

## Pré-requisitos

- Node.js 20.19+ ou 22.12+ (recomendado: Node 24 no aaPanel)
- MySQL (aaPanel)
- App registration Azure AD **multitenant**

## Portas de desenvolvimento

| Serviço   | Porta |
|-----------|-------|
| API Node  | **3001** |
| Angular   | **4201** |

## 1. Registro no Azure (Entra ID)

1. Crie uma app **multitenant**: *Accounts in any organizational directory*.
2. **Redirect URIs (SPA):**
   - `http://localhost:4201`
   - `http://127.0.0.1:4201`
   - URL HTTPS de produção (ex.: `https://intranet.seudominio.com`)
3. Permissões delegadas: `User.Read`, `openid`, `profile`.
4. Permissões de **aplicação** (consentimento de administrador em cada tenant):
   - `User.Read.All` — leitura do diretório (sync de colaboradores)
   - `MailboxSettings.Read` — **obrigatória** para excluir caixas compartilhadas (`SharedMailbox`), salas e equipamentos do sync AD (campo Graph `mailboxSettings.userPurpose`, equivalente ao tipo de caixa no Exchange)
   - `User.ReadWrite.All` — **obrigatória** para edição/importação em Gestão de Usuários (PATCH Graph, inclusive directory extensions para ramal e aniversário)
   - `Application.Read.All` + `Application.ReadWrite.All` — registrar directory extensions (`ramal`, `dataNascimento`) na app de cada tenant
   - `Calendars.ReadWrite` — **obrigatória** para gravar a reserva de massagem na agenda Outlook do colaborador (`POST`/`PATCH`/`DELETE /users/{id}/events`). Se existir Application Access Policy no Exchange, incluir as mailboxes dos colaboradores (não só salas/recursos)
5. O `tid` (tenant ID) de cada empresa deve ser cadastrado em `azure_tenants` com `ativo=1`.

### Sync AD — excluir caixas compartilhadas

O tipo de caixa exibido no Exchange (`UserMailbox` / `SharedMailbox`) corresponde ao campo Graph `mailboxSettings.userPurpose` (`user`, `shared`, `room`, `equipment`). **Não há filtro em massa na listagem `/users`** — o backend consulta esse campo por usuário durante a sync.

- Com `MailboxSettings.Read` concedida: caixas `shared`, `room` e `equipment` são ignoradas automaticamente.
- Sem essa permissão: a sync continua com heurística (nome/matrícula) e registra aviso no resumo (`mailbox_purpose_disponivel: false`).

**Como conceder:** Azure Portal → App registrations → sua app → API permissions → Add permission → Microsoft Graph → **Application permissions** → `MailboxSettings.Read` → **Grant admin consent** (repetir em cada tenant).

### Agenda Outlook — massagem

Ao confirmar, trocar ou cancelar uma sessão em `/massagem`, o backend cria, atualiza ou remove um compromisso **privado** na agenda Outlook do colaborador via Graph (escrita direta na caixa, sem convite). A reserva na intranet continua mesmo se o Graph falhar.

**Como conceder:** Azure Portal → App registrations → sua app → API permissions → Add permission → Microsoft Graph → **Application permissions** → `Calendars.ReadWrite` → **Grant admin consent** (repetir em cada tenant cadastrado em `azure_tenants`).

Se o Exchange tiver **Application Access Policy**, incluir as mailboxes dos colaboradores — não só salas e recursos. Sem essa permissão o agendamento na intranet segue normal; o erro fica só no log (`[massagem] outlook background`).

### Directory extensions (ramal e aniversário)

Ramal e data de nascimento são gravados em **directory extensions** do Entra ID (propriedades `ramal` e `dataNascimento` na app de cada tenant), graváveis via Graph com `User.ReadWrite.All`.

- **Leitura na sync:** prioridade na directory extension; se vazia, fallback para `extensionAttribute5` / `extensionAttribute6` do AD on-premises.
- **Valores novos** ficam na nuvem (não replicam para o AD local).
- **Migração one-shot** dos dados legados do AD para a extension:

```bash
cd backend
npm run colaboradores:migrate-extensions -- --dry-run   # simula
npm run colaboradores:migrate-extensions                # aplica
```

Ou via API autenticada: `POST /api/v1/colaboradores/admin/migrate-extensions?dry_run=1`

**Erro `extension properties are not available`:** após registrar novas properties na app, o Graph pode levar ~10–15 s para propagar. O backend aguarda automaticamente e faz retry. Se a migração falhou antes dessa correção, rode novamente — só migra quem ainda não tem dados na extension.

Variáveis opcionais:

| Variável | Descrição |
|----------|-----------|
| `GRAPH_SCHEMA_EXTENSION_ID` | Nome da extension (padrão: `IntranetWtColaborador`) |
| `GRAPH_SCHEMA_EXTENSION_SKIP_REGISTER` | `1` — não chama API de registro; assume extension já publicada |

## 2. Backend

```bash
cd backend
cp .env.example .env
# Edite: JWT_SECRET (mín. 32 chars), ENCRYPTION_KEY (openssl rand -hex 32), DB_*, ADMIN_PASSWORD
npm install --cache /tmp/npm-cache-intranet
mkdir -p storage/documentos
chown -R www:www storage/
npm run db:migrate
npm run db:seed
npm run dev
```

API: `http://127.0.0.1:3001`

### Variáveis `.env`

| Variável | Descrição |
|----------|-----------|
| `PORT` | `3001` |
| `DB_*` | Conexão MySQL |
| `JWT_SECRET` | Segredo JWT (≥32 caracteres) |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` — criptografa client secrets |
| `CORS_ORIGINS` | `http://localhost:4201,http://127.0.0.1:4201` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap do admin local |
| `STORAGE_DIR` | Diretório **fora da pasta pública** para arquivos de documentos |
| `MAX_UPLOAD_MB` | Limite de upload em MB (padrão: `50`) |
| `EMAIL_PROVIDER` | `smtp` ou `acs` — fallback do provedor de e-mail (config principal no BD) |
| `EMAIL_OCULTAR_PARA` | `1`/`true` — ocultar destinatário no campo Para (BCC) |

### E-mail (SMTP e Azure ACS)

O envio de e-mail da intranet é centralizado em `backend/src/utils/emailSender.js`. Configure em **Admin → Configurações → E-mail**:

- **SMTP** — host, porta, TLS, usuário, senha e remetente
- **Azure ACS** — connection string e endereço remetente verificado

Pré-requisitos e limites do Azure ACS: [docs/email-azure-acs.md](docs/email-azure-acs.md)

API admin: `GET/PUT /api/v1/configuracoes/email`, `POST /api/v1/configuracoes/email/teste`, `POST /api/v1/configuracoes/email/verificar` (SMTP).

Exemplo:

```env
STORAGE_DIR=/www/wwwroot/IntranetWTorre/intranet-wtorre/backend/storage/documentos
MAX_UPLOAD_MB=50
```

> Os arquivos **nunca** ficam em `dist/` ou em pasta servida pelo Nginx. O acesso é sempre via API autenticada (`/api/v1/documentos/:id/view` ou `/download`).

### Rotas principais (`/api/v1`)

| Método | Rota | Auth |
|--------|------|------|
| POST | `/auth/login` | Público (admin local) |
| POST | `/auth/login-microsoft` | Bearer id_token Azure |
| POST | `/auth/refresh` | Público |
| POST | `/auth/logout` | Público |
| GET | `/auth/me` | JWT |
| GET | `/auth/profile-photo` | JWT |
| GET | `/tenants/msal-config` | Público |
| CRUD | `/tenants` | ADMIN |
| GET | `/menu` | JWT |
| CRUD | `/menu`, `/menu/admin`, `/menu/reorder` | ADMIN |
| GET | `/doc-categorias` | JWT |
| CRUD | `/doc-categorias`, `/doc-categorias/admin`, `/doc-categorias/reorder` | ADMIN |
| GET | `/documentos?categoria=<id\|slug>` | JWT |
| GET | `/documentos/:id/view`, `/documentos/:id/download` | JWT |
| POST/PUT/DELETE | `/documentos` | ADMIN (upload multipart) |

## 3. Frontend

```bash
cd frontend
npm install --cache /tmp/npm-cache-intranet
ng serve
# ou: PATH=/www/server/nodejs/v24.16.0/bin:$PATH ng serve
```

Acesse: **http://localhost:4201** (proxy `/api` → `3001`)

### Páginas de documentos

| Rota | Descrição |
|------|-----------|
| `/documentos` | Repositório de documentos (sidebar + lista) |
| `/documentos/:slug` | Deep-link por categoria (ex.: `/documentos/compliance`) |
| `/admin/documentos` | Gestão de categorias e upload (ADMIN) |

## 4. Bootstrap (primeira vez)

1. `npm run db:migrate` + `npm run db:seed` (cria admin local + categorias de documentos).
2. Login em `/login` → toggle **Login sem Microsoft (admin)**.
3. Acesse `/admin/tenants` → cadastre os 4 tenants → marque um como **Principal**.
4. Teste **Entrar com Microsoft** com conta de tenant cadastrado.
5. Acesse `/admin/documentos` → faça upload de um PDF de teste.

Credencial seed (se `ADMIN_PASSWORD` no `.env`): `admin@grupowtorre.com`

## 5. Deploy no aaPanel

### Frontend

```bash
cd frontend
./scripts/deploy-frontend.sh
# O script faz build e publica em dist/frontend/browser (document root do nginx).
# Caminho nginx: /www/wwwroot/IntranetWTorre/intranet-wtorre/frontend/dist/frontend/browser
```

### Backend (PM2 / Projeto Node)

```bash
cd backend
npm install --cache /tmp/npm-cache-intranet
mkdir -p storage/documentos
chown -R www:www storage/
npm run db:migrate
npm run db:seed
pm2 restart intranet-api   # ou o nome do processo PM2
```

- Diretório: `backend/`
- Comando: `node src/server.js`
- `PORT=3001`
- PM2 roda como usuário **www** — o `STORAGE_DIR` deve pertencer a `www:www`

### Nginx

```nginx
client_max_body_size 50M;

location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# index.html sempre fresco (evita main.js antigo apontando para chunks que não existem)
location = /index.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
    try_files /index.html =404;
}

# Assets com hash: servir arquivo real ou 404 — NUNCA devolver index.html para .js/.css
location ~* \.(?:js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp|map)$ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location / {
    try_files $uri $uri/ /index.html;
}
```

> `client_max_body_size` deve ser igual ou maior que `MAX_UPLOAD_MB` (padrão 50M). Sem isso, uploads maiores que 1 MB retornam **413** do Nginx antes de chegar à API.

> Use `proxy_pass http://127.0.0.1:3001/api/;` (com `/api/`) para preservar o prefixo `/api/v1` nas rotas.

### SSL

- Let's Encrypt no aaPanel.
- Cadastre a URL HTTPS de produção como Redirect URI no Azure.

## 6. Troubleshooting

| Problema | Solução |
|----------|---------|
| 404 ao recarregar rota Angular | Falta `try_files ... /index.html` |
| `chunk-*.js` MIME type text/html / Failed to fetch dynamically imported module | Deploy incompleto: rode `WEB_ROOT=... ./scripts/deploy-frontend.sh` copiando **todos** os arquivos de `dist/frontend/browser/`. Ajuste nginx para **não** devolver `index.html` em `.js` (ver bloco nginx acima). Hard refresh (Ctrl+Shift+R). |
| CORS | Confira `CORS_ORIGINS` com a origem exata do browser |
| "Tenant Azure não autorizado" | Cadastre o `tid` em `/admin/tenants` |
| MSAL não configurado (âmbar) | Defina um tenant **Principal** ativo |
| 403 sem departamento AD | Preencha `department` (ou company/office/job) no Azure AD |
| `Access denied` MySQL | Ajuste `DB_USER`/`DB_PASS` no aaPanel |
| Upload retorna 413 | Ajuste `client_max_body_size` no Nginx e `MAX_UPLOAD_MB` no `.env` |
| Erro de permissão no upload | `chown -R www:www backend/storage/` |
| Tipo de arquivo rejeitado | Apenas pdf, docx, xlsx, pptx, png, jpg, jpeg, zip |

## 7. Fluxo de autenticação

1. Front carrega `GET /api/v1/tenants/msal-config` → `clientId` do tenant principal.
2. MSAL `loginRedirect` (authority `common`).
3. `POST /api/v1/auth/login-microsoft` com id_token → validação JWKS + allow-list `tid`.
4. Graph (client credentials) → departamento obrigatório → provisionamento MySQL.
5. API emite **accessToken + refreshToken** JWT próprios (não substituídos pelo token Microsoft).

## Referência visual

Ver [`docs/reference/README.md`](docs/reference/README.md).
