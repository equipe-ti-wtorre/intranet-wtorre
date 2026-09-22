# Módulo SharePoint — especificação para recriar em outro projeto

Documento de portabilidade da integração **Microsoft Graph → SharePoint** usada na Intranet WTorre. Serve para baixar um arquivo (em geral XLSX) e sincronizar o conteúdo no banco.

**Escopo:** autenticação client credentials, download do arquivo, configuração (URL ou site/biblioteca), teste de conexão, sync manual/agendada e painel admin.  
**Fora de escopo:** parser XLSX específico de Camarotes/Follow-up, regras de negócio das planilhas, envio de e-mail.

Consumidores atuais neste repositório:

| Módulo | Modo de localização | Parser |
|--------|---------------------|--------|
| Camarotes | URL de compartilhamento (`sharepoint_url`) | `camarotes-xlsx.mapper.js` |
| Follow-up de Suprimentos | URL de compartilhamento (`sharepoint_url`) | `followup-xlsx.mapper.js` |

Há um **modo alternativo** (site + biblioteca + caminho/Item ID) implementado em `followup-graph.service.js`. O sync em produção usa só a URL.

```mermaid
flowchart LR
  admin[Painel_admin] --> cfg[(config_sharepoint_url)]
  cfg --> sync[Sync]
  tenant[(azure_tenants_principal)] --> token[OAuth_client_credentials]
  token --> graph[Microsoft_Graph]
  sync --> token
  graph --> file[Arquivo_XLSX]
  file --> parser[Parser_de_aba]
  parser --> db[(tabelas_do_modulo)]
  cron[Cron_lider_PM2] --> sync
```

---

## Visão geral

O backend **não** usa credenciais de usuário. Usa o **tenant Azure principal** (App Registration) com `grant_type=client_credentials` e `scope=https://graph.microsoft.com/.default`.

Fluxo mínimo:

1. Carregar config (`sharepoint_url`, nome da aba, intervalo de sync).
2. Obter o tenant principal (`eh_principal = 1`, com `client_secret` cifrado).
3. Trocar `client_id` + `client_secret` por um `access_token`.
4. Resolver a URL de compartilhamento em `driveId` + `itemId`.
5. Baixar `/drives/{driveId}/items/{itemId}/content` como `Buffer`.
6. Parsear a(s) aba(s) e gravar no banco.
7. Registrar log + `ultima_sync`.

---

## Pré-requisitos Azure

### App Registration (tenant principal)

| Item | Valor |
|------|--------|
| Fluxo | Application (não delegated) |
| Token | `POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token` |
| Body | `client_id`, `client_secret`, `scope=https://graph.microsoft.com/.default`, `grant_type=client_credentials` |

Permissões de **aplicação** no Microsoft Graph (consentimento de admin):

| Permissão | Uso |
|-----------|-----|
| `Sites.Selected` | Acesso a sites/arquivos SharePoint específicos (recomendado) |
| *ou* `Sites.Read.All` / `Files.Read.All` | Mais amplo; evita grant por site, mas é excessivo |

Com `Sites.Selected`, o app precisa de grant no site (ex.: Graph `POST /sites/{siteId}/permissions` com role `read`, ou PnP/SharePoint Admin). Sem isso o download retorna **403**.

O **link de compartilhamento** deve ser acessível à aplicação (arquivo no site concedido). Use o botão **Copiar link** do SharePoint. Remova `?rtime=…` (o código já normaliza).

### Tenant no banco

Tabela `azure_tenants` (já existe na intranet):

| Coluna | Uso |
|--------|-----|
| `azure_tenant_id` | Directory (tenant) ID |
| `client_id` | Application (client) ID |
| `client_secret_ciphertext` | Secret cifrado (`crypto.service`) |
| `eh_principal` | Só um registro ativo é o principal |
| `ativo` | Precisa ser `1` |

A sync SharePoint **sempre** usa `findPrincipal()`. Sem tenant principal com secret → HTTP **503**.

---

## Dois modos de localização do arquivo

### Modo A — URL de compartilhamento (preferido / produção)

Campo único: `sharepoint_url`.

Exemplos:

```
https://grupowtorre.sharepoint.com/:x:/s/...
https://wtorre.sharepoint.com/:x:/r/sites/.../_layouts/15/Doc.aspx?sourcedoc=...
```

Passos Graph:

1. Normalizar URL (tirar `rtime`).
2. Codificar: `shareId = "u!" + base64url(url)`.
3. `GET /shares/{shareId}/driveItem` → `id` + `parentReference.driveId`.
4. `GET /drives/{driveId}/items/{itemId}/content` → bytes do arquivo.

### Modo B — site + biblioteca + caminho (alternativo)

Útil quando não há link de compartilhamento, só o caminho no site.

| Campo | Exemplo |
|-------|---------|
| `hostname` | `wtorre.sharepoint.com` |
| `site_path` | `/sites/Suprimentos` |
| `biblioteca` | `Documentos` (aliases: `Documents`, `Shared Documents`) |
| `arquivo_caminho` **ou** `item_id` | `Pasta/planilha.xlsx` ou GUID do item |

Passos Graph:

1. `GET /sites/{hostname}:{site_path}` → `site.id`
2. `GET /sites/{siteId}/drives` → escolher drive pelo nome
3. Path: `GET /drives/{driveId}/root:/{path}:/content`
4. Item ID: `GET /drives/{driveId}/items/{itemId}/content`

---

## Núcleo reutilizável (Node.js)

Copiar para o outro projeto. Depende só de `fetch` (Node 18+) e de um token Graph.

```js
function encodeDrivePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeShareUrl(shareUrl) {
  const trimmed = String(shareUrl || '').trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.searchParams.delete('rtime');
    return url.toString();
  } catch {
    return trimmed.replace(/([?&])rtime=[^&]*&?/g, '$1').replace(/[?&]$/, '');
  }
}

function encodeShareUrl(shareUrl) {
  const normalized = normalizeShareUrl(shareUrl);
  if (!normalized) throw new Error('URL de compartilhamento vazia.');
  return `u!${Buffer.from(normalized, 'utf8').toString('base64url')}`;
}

async function getAppToken({ azure_tenant_id, client_id, client_secret }) {
  const url = `https://login.microsoftonline.com/${azure_tenant_id}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id,
    client_secret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Falha ao obter token Graph');
  }
  return data.access_token;
}

async function downloadDriveItemContent(token, driveId, fileRef) {
  const ref = String(fileRef || '').trim();
  if (!ref) throw new Error('Referência do arquivo SharePoint não configurada.');

  const isPath = ref.includes('/') || ref.includes('\\');
  const url = isPath
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeDrivePath(ref.replace(/\\/g, '/'))}:/content`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(ref)}/content`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Falha ao baixar arquivo do SharePoint via Graph.');
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadSharedDriveItemContent(token, shareUrl) {
  const shareId = encodeShareUrl(shareUrl);
  const metaUrl = `https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareId)}/driveItem`;
  const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Falha ao resolver URL de compartilhamento via Graph.');
  }
  const meta = await metaRes.json();
  const driveId = meta.parentReference?.driveId || meta.driveId;
  const itemId = meta.id;
  if (!driveId || !itemId) {
    const err = new Error('Metadados do arquivo incompletos na resposta Graph (/shares).');
    err.status = 502;
    throw err;
  }
  return downloadDriveItemContent(token, driveId, itemId);
}

function normalizeSitePath(sitePath) {
  let p = String(sitePath || '').trim();
  if (!p) return '';
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/\/+$/, '') || '/';
}

async function graphGet(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Falha Graph (${res.status})`);
    err.status = res.status === 404 ? 404 : res.status === 403 ? 403 : 502;
    err.graphCode = data.error?.code || null;
    throw err;
  }
  return data;
}

async function resolveSite(token, hostname, sitePath) {
  const host = String(hostname || '').trim();
  const path = normalizeSitePath(sitePath);
  if (!host) {
    const err = new Error('Hostname do SharePoint não configurado.');
    err.status = 400;
    throw err;
  }
  if (!path || path === '/') {
    const err = new Error('Caminho do site não configurado (ex.: /sites/Suprimentos).');
    err.status = 400;
    throw err;
  }
  try {
    return await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${host}:${path}`);
  } catch (err) {
    if (err.status === 404) {
      const e = new Error(`Site não encontrado: ${host}${path}`);
      e.status = 404;
      throw e;
    }
    if (err.status === 403) {
      const e = new Error(
        'Permissão negada ao site SharePoint. Verifique Sites.Selected / consentimento do App Registration.'
      );
      e.status = 403;
      throw e;
    }
    throw err;
  }
}

async function resolveDrive(token, siteId, biblioteca) {
  const drives = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`);
  const list = Array.isArray(drives.value) ? drives.value : [];
  if (!list.length) {
    const err = new Error('Nenhuma biblioteca encontrada no site.');
    err.status = 404;
    throw err;
  }
  const wanted = String(biblioteca || '').trim().toLowerCase();
  if (!wanted) return list[0];

  const aliases = {
    documentos: ['documentos', 'documents', 'shared documents', 'documentos compartilhados'],
  };
  const drive =
    list.find((d) => String(d.name || '').trim().toLowerCase() === wanted) ||
    list.find((d) => {
      const n = String(d.name || '').trim().toLowerCase();
      const alts = aliases[wanted] || [];
      return alts.includes(n) || n.includes(wanted);
    });
  if (!drive) {
    const names = list.map((d) => d.name).join(', ');
    const err = new Error(`Biblioteca "${biblioteca}" não encontrada. Disponíveis: ${names}`);
    err.status = 404;
    throw err;
  }
  return drive;
}

async function downloadBySiteConfig(token, config) {
  const itemId = String(config.item_id || '').trim();
  const arquivo = String(config.arquivo_caminho || '').trim();
  if (!itemId && !arquivo) {
    const err = new Error('Informe o caminho do arquivo ou o Item ID.');
    err.status = 400;
    throw err;
  }
  const site = await resolveSite(token, config.hostname, config.site_path);
  const drive = await resolveDrive(token, site.id, config.biblioteca);
  const buffer = itemId
    ? await downloadDriveItemContent(token, drive.id, itemId)
    : await downloadDriveItemContent(token, drive.id, arquivo);
  return { buffer, siteId: site.id, driveId: drive.id, driveName: drive.name || null };
}
```

Uso típico (modo A):

```js
const token = await getAppToken(tenant);
const buffer = await downloadSharedDriveItemContent(token, normalizeShareUrl(shareUrl));
```

---

## Configuração persistida

Padrão: tabela `*_config` com **uma linha** (`id = 1`).

### Camarotes (`camarotes_config`)

| Coluna | Tipo | Default |
|--------|------|---------|
| `sharepoint_url` | TEXT NULL | — |
| `sharepoint_sheet` | VARCHAR(100) | `Camarotes` |
| `sync_automatica` | TINYINT(1) | — |
| `sync_frequencia` | ENUM/string | `1h` \| `6h` \| `12h` \| `24h` \| `semanal` |
| `ultima_sync` | TIMESTAMP | — |

Fallback de URL: env `CAMAROTES_FILE_SHARE_URL`. Fallback de aba: env `CAMAROTES_SHEET_CAMAROTE` ou `Camarotes`.

### Follow-up (`followup_config`)

| Coluna | Tipo | Default |
|--------|------|---------|
| `sharepoint_url` | TEXT NULL | — |
| `hostname` | VARCHAR(255) | legado modo B |
| `site_path` | VARCHAR(255) | legado modo B |
| `biblioteca` | VARCHAR(255) | legado modo B |
| `arquivo_caminho` | VARCHAR(512) | legado modo B |
| `item_id` | VARCHAR(120) | legado modo B |
| `aba_rm` | VARCHAR(80) | `TblRM` / `Requisição` |
| `aba_matriz` | VARCHAR(80) | `TblMatrizMensagens` |
| `sync_automatica` | TINYINT(1) | `0` |
| `sync_intervalo_min` | INT | `60` (min 5, max 10080) |
| `ultima_sync` | TIMESTAMP | — |
| `ultima_sync_status` | VARCHAR(20) | `sucesso` \| `erro` |
| `ultima_sync_linhas` | INT | — |
| `ultima_sync_erro` | TEXT | — |

Ao gravar `sharepoint_url`, **normalizar** (remover `rtime`) no repositório.

### Log de sync

```sql
CREATE TABLE IF NOT EXISTS <modulo>_sync_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  iniciado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizado_em TIMESTAMP NULL,
  status ENUM('sucesso','erro') NOT NULL,  -- Camarotes usa VARCHAR: ok|erro
  linhas_importadas INT NOT NULL DEFAULT 0,
  mensagem_erro TEXT NULL
);
```

---

## Pipeline de sincronização

Contrato comum (ambos os módulos):

1. Lock in-memory: se já rodando → **409** `"Sincronização já em andamento."`
2. Validar `sharepoint_url` (e tenant).
3. Token Graph + download → `Buffer`.
4. Parser da aba → registros.
5. Replace/upsert no banco.
6. `insertSyncLog` + `touchUltimaSync`.
7. `finally`: liberar lock.

Mapeamento de erros do Graph no download:

| Condição | HTTP | Mensagem |
|----------|------|----------|
| URL vazia | 400 / 503 | URL não configurada |
| Sem tenant/secret | 503 | Tenant principal não configurado |
| 404 / `itemNotFound` | 404 | Arquivo não encontrado pela URL |
| 403 / `accessDenied` | 403 | Permissão negada — Sites.Selected e o link |
| Outros | 502 / 500 | Mensagem do Graph |

### Teste de conexão (Follow-up)

Não grava dados. Devolve passos para a UI:

```json
{
  "ok": true,
  "passos": [
    { "passo": "url", "ok": true, "detalhe": "URL de compartilhamento configurada." },
    { "passo": "autenticacao", "ok": true, "detalhe": "Token Graph obtido (tenant principal)." },
    { "passo": "arquivo", "ok": true, "detalhe": "Arquivo baixado (123456 bytes)." },
    { "passo": "aba_rm", "ok": true, "detalhe": "Aba Requisição: col1, col2…" },
    { "passo": "aba_matriz", "ok": true, "detalhe": "Aba TblMatrizMensagens encontrada." }
  ]
}
```

No modo B, os passos são: `autenticacao` → `site` → `biblioteca` → `arquivo`.

### Cron

- Só a instância líder PM2: `NODE_APP_INSTANCE` ausente ou `"0"`.
- Follow-up: `setInterval` com `sync_intervalo_min` (mínimo 5).
- Camarotes: `setInterval` com mapa `1h/6h/12h/24h/semanal`.
- Se URL ausente ou sync desligada, não agenda.
- Se `ultima_sync` está atrasada, dispara um run inicial após alguns segundos.
- Ignorar 409 no catch do cron (sync concorrente).

---

## Contrato da API (admin)

JWT + módulo admin correspondente.

### Follow-up — base `/api/v1/followup` (ajustar o prefixo do projeto)

| Método | Rota | Função |
|--------|------|--------|
| GET | `/config` | Config atual |
| PUT | `/config` | `{ sharepoint_url, aba_*, sync_automatica, sync_intervalo_min }` |
| POST | `/testar-conexao` | Diagnóstico por passos |
| POST | `/sincronizar` | Sync agora |
| GET | `/status-sync` | Última sync + `sync_em_andamento` |

PUT `/config` reagenda o cron.

### Camarotes — base `/api/v1/camarotes`

| Método | Rota | Função |
|--------|------|--------|
| GET | `/config` | Inclui `sharepoint_url` e `sharepoint_sheet` |
| PUT | `/config` | Parciais; `sharepoint_*` opcionais |
| POST | `/sincronizar` | Sync agora |
| GET | `/sync-log` | Histórico |

Não há `testar-conexao` em Camarotes: o botão “Testar sincronização” chama `POST /sincronizar`.

---

## Painel admin (UI)

Aba **SharePoint** no módulo admin:

1. Hint: colar o link do botão “Copiar link”; sem `?rtime=…`.
2. Input URL (`type=url`).
3. Input(s) de aba Excel.
4. Badge: **Configurado** (mostra URL) ou **não configurada** / fallback env.
5. Botões: **Salvar**, **Testar conexão** (se houver), **Sincronizar agora**.
6. Lista de passos do diagnóstico (ok/fail).

Aba **Sincronização**:

- Toggle sync agendada.
- Intervalo (minutos ou frequência).
- Status: data, status, linhas, em andamento, último erro.

---

## Modelo TypeScript (config)

```ts
interface SharePointFileConfig {
  sharepoint_url: string | null;
  /** Modo B (opcional / legado) */
  hostname?: string | null;
  site_path?: string | null;
  biblioteca?: string | null;
  arquivo_caminho?: string | null;
  item_id?: string | null;
}

interface SharePointSyncStatus {
  sync_em_andamento: boolean;
  ultima_sync: string | null;
  ultima_sync_status: string | null;
  ultima_sync_linhas: number | null;
  ultima_sync_erro: string | null;
  sync_automatica: boolean;
}

interface SharePointTestePasso {
  passo: string;
  ok: boolean;
  detalhe: string;
}
```

---

## Checklist de recriação

1. **Azure** — App Registration com client secret; Graph Application `Sites.Selected` (grant no site) ou `Files.Read.All`; admin consent.
2. **Tenant** — persistir `tenant_id`, `client_id`, secret; marcar um como principal.
3. **Núcleo Graph** — `getAppToken`, `normalizeShareUrl`, `downloadSharedDriveItemContent` (e opcionalmente modo B).
4. **Config** — tabela singleton com `sharepoint_url` + nome(s) de aba + flags de cron.
5. **Sync** — lock 409, download, parse, persist, log, `ultima_sync`.
6. **Cron** — só líder PM2; reagendar no PUT config.
7. **API admin** — GET/PUT config, POST sincronizar, GET status; opcional POST testar-conexão.
8. **UI** — aba SharePoint (URL + abas + teste) e aba Sync.
9. **Sanidade** — URL sem `rtime`; 403 aponta para Sites.Selected; 404 para link/arquivo.

---

## Referências no repositório original

| Peça | Caminho |
|------|---------|
| Token + download URL | `backend/src/services/graph.service.js` (`getAppToken`, `normalizeShareUrl`, `encodeShareUrl`, `downloadSharedDriveItemContent`, `downloadDriveItemContent`) |
| Modo site/biblioteca | `backend/src/services/followup-graph.service.js` |
| Sync Camarotes | `backend/src/services/camarotes-sync.service.js` |
| Cron Camarotes | `backend/src/services/camarotes-cron.service.js` |
| Sync Follow-up | `backend/src/services/followup-sync.service.js` |
| Cron Follow-up | `backend/src/services/followup-cron.service.js` |
| Tenant principal | `backend/src/repositories/tenants.repository.js` (`findPrincipal`) |
| Config Camarotes | `backend/src/repositories/camarotes.repository.js` |
| Config Follow-up | `backend/src/repositories/followup.repository.js` |
| Rotas | `backend/src/routes/camarotes.routes.js`, `backend/src/routes/followup.routes.js` |
| Admin Camarotes | `frontend/src/app/pages/admin/camarotes/` |
| Admin Follow-up | `frontend/src/app/pages/admin/followup-suprimentos/` |
| Migration URL Camarotes | `backend/src/db/migrations/036_camarotes_sharepoint_config.sql` |
| Migration Follow-up | `backend/src/db/migrations/049_followup_suprimentos.sql`, `050_followup_sharepoint_url.sql` |
| Env | `CAMAROTES_FILE_SHARE_URL`, `CAMAROTES_SHEET_CAMAROTE` em `backend/.env.example` |
