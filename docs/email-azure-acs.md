# Módulo Azure ACS — E-mail (Communication Services)

Documentação do provedor **Azure Communication Services Email** na intranet WTorre: configuração admin, envio unificado, rate limit e webhook de entrega.

---

## Visão geral

O envio de e-mail da intranet é unificado em [`emailSender.js`](../backend/src/utils/emailSender.js). Dois provedores são suportados e escolhidos em **Admin → Configurações → E-mail**:

| Provedor | SDK / lib | Uso típico |
|----------|-----------|------------|
| **SMTP** | Nodemailer | Servidor SMTP corporativo |
| **Azure ACS** | `@azure/communication-email` | Domínio verificado no Azure + rastreamento de entrega |

Consumidores (ex.: alertas de Camarotes, solicitação de colaborador, teste admin) chamam apenas `sendEmail()` / `sendMailBatched()` — não conhecem o provedor.

| Aspecto | Implementação |
|---------|---------------|
| Configuração UI | `/admin/configuracoes` (aba E-mail), módulo RBAC `configuracoes` |
| Persistência | Tabela `email_provider_config` (singleton `id = 1`) |
| Segredo ACS | Connection string cifrada AES-256-GCM (`crypto.service`) — write-only na API |
| Rate limit | 30/min, 100/h, 2400/dia (em memória no processo) |
| Entrega / bounce | Webhook Event Grid → `POST /api/v1/webhooks/acs-email` |

---

## Arquivos principais

| Camada | Caminho |
|--------|---------|
| Envio unificado | `backend/src/utils/emailSender.js` |
| Rate limit / BCC / batch | `backend/src/utils/email-sender.helpers.js` |
| Config (get/save/validate) | `backend/src/services/email-config.service.js` |
| Repositório | `backend/src/repositories/email-provider-config.repository.js` |
| API admin | `backend/src/controllers/configuracoes.controller.js` + `routes/configuracoes.routes.js` |
| Webhook ACS | `backend/src/controllers/acs-email-webhook.controller.js` |
| Assinatura Event Grid | `backend/src/middleware/event-grid-webhook.middleware.js` |
| UI admin | `frontend/src/app/pages/admin/configuracoes/configuracoes-admin.component.*` |
| Migration | `backend/src/db/migrations/031_email_provider_config.sql` |

---

## Autorização e rotas

### Frontend

| Rota | Guard | Descrição |
|------|-------|-----------|
| `/admin/configuracoes` | `moduloGuard('configuracoes')` | Painel SMTP / Azure ACS |

### Backend — configuração (`/api/v1/configuracoes`)

Todas exigem JWT + módulo `configuracoes` (`requireModulo`).

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/email` | Config pública (sem segredos; só `has_acs_connection_string`) |
| `PUT` | `/email` | Salvar provedor, ACS/SMTP, flags `ativo` / `ocultar_para` |
| `POST` | `/email/verificar` | Verifica conexão SMTP (ACS não usa este fluxo) |
| `POST` | `/email/teste` | Envia e-mail de teste pelo provedor ativo |

### Backend — webhook (público)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `POST` | `/api/v1/webhooks/acs-email` | Assinatura Event Grid (`aeg-signature`) | Validação de subscription + delivery reports |

Sem JWT. Validação de subscription Event Grid passa sem assinatura; eventos de entrega exigem `EVENT_GRID_WEBHOOK_SECRET`.

---

## Banco de dados

### `email_provider_config` (migration `031`)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | INT PK | Sempre `1` (config singleton) |
| `provider` | VARCHAR(10) | `smtp` ou `acs` |
| `acs_connection_string_ciphertext` | TEXT NULL | Connection string cifrada |
| `acs_sender` | VARCHAR(255) | Remetente do domínio verificado |
| `ocultar_para` | TINYINT(1) | Destinatário real vai em BCC; Para = remetente |
| `ativo` | TINYINT(1) | Envio habilitado |
| `atualizado_em` | TIMESTAMP | Última alteração |

O GET público devolve apenas `has_acs_connection_string` (boolean), nunca o ciphertext nem o valor em claro.

---

## Segurança

- Connection string ACS e senha SMTP: **AES-256-GCM** via `ENCRYPTION_KEY` — nunca em texto puro no banco, UI ou logs.
- Campos de segredo são **write-only**: omitir no PUT preserva o valor existente; string vazia não sobrescreve.
- `EVENT_GRID_WEBHOOK_SECRET` valida a assinatura `aeg-signature` dos delivery reports.
- Proibido colocar connection string ACS no `.env` — somente no painel admin (banco cifrado).

---

## Pré-requisitos no Azure

### 1. Communication Services

Criar recurso **Communication Services** na subscription.

### 2. Email Communication Services + domínio

Associar **Email Communication Services** e um domínio de envio. Configurar DNS:

| Registo | Finalidade |
|---------|------------|
| **SPF** | Autorização dos servidores de envio |
| **DKIM** | Assinatura de mensagens |
| **DMARC** | Política de autenticação (recomendado) |

Aguardar propagação e confirmar domínio **Verified**.

### 3. Connection string e remetente

Em **Settings → Keys**, copiar a **Connection String**. Remetente no formato `no-reply@seudominio.com` (autorizado no domínio verificado).

### 4. Event Grid (entrega / bounce)

Para status **entregue** / **bounce** nos disparos de Camarotes:

1. No recurso Communication Services, criar subscription **Event Grid**
2. Evento: **Email Delivery Report Received** (`Microsoft.Communication.EmailDeliveryReportReceived`)
3. Endpoint: `https://<host-da-api>/api/v1/webhooks/acs-email`
4. Configurar o secret da subscription em `EVENT_GRID_WEBHOOK_SECRET`
5. Concluir a validação automática (`validationResponse`)

Mapeamento no backend (`mapAcsDeliveryStatus`):

| Status ACS | Status interno |
|------------|----------------|
| `Delivered` | `entregue` |
| Qualquer outro terminal (bounce, spam, quarentena, …) | `bounce` |

Correlação por `messageId` → `camarotes_alertas_destinos.message_id`.

Detalhes de fila e status: [camarotes-alertas.md](./camarotes-alertas.md).

---

## Limites e throttling

Rate limiter em memória (`email-sender.helpers.js`), alinhado aos limites padrão do Azure:

| Janela | Limite total | Disparo (`normal`) | Transacional (`high`) |
|--------|--------------|--------------------|------------------------|
| 1 minuto | 30 e-mails | 25 (5 reservados) | até 30 (usa a reserva) |
| 1 hora | 100 e-mails | 85 (15 reservados) | até 100 (usa a reserva) |
| 24 horas | 2.400 e-mails | 2.400 | 2.400 |

Envios `priority: 'high'` entram na frente da fila de disparo. Massagem usa `high` em confirmação, cancelamento, fila, falta e lembrete; o disparo da sessão permanece `normal`.

Quando o limite é atingido, `acsRateLimit` aguarda a janela, registra `[email-acs] aguardando Ns (...)` e pode notificar via callback `onAcsWait` (usado pelos alertas de Camarotes para status `na_fila` + `enviar_em`).

O ACS considera o envio **aceito** em `beginSend` (HTTP 202). `pollUntilDone` roda em background (log se falhar), para não bloquear o próximo destinatário nem estourar o teto de *Get Email Status* (60/min, 200/hora). Quem precisar esperar o `Succeeded` passa `waitUntilDone: true`.

A config descriptografada fica em cache por 30s; o `EmailClient` ACS é reutilizado. Salvar a config no admin invalida os dois.

Em lotes (`sendMailBatched`), throttle ACS adicional:

| Parâmetro | Valor ACS |
|-----------|-----------|
| `batchSize` | 10 |
| `delayItem` | 2.000 ms |
| `delayBatch` | 40.000 ms |

---

## API de envio (interna)

```js
const { sendEmail, sendMailBatched, getMailSender } = require('./utils/emailSender');

await sendEmail({
  to: 'destino@empresa.com',
  subject: '...',
  html: '...',
  text: '...',           // opcional; ACS gera plainText do HTML se omitido
  attachments: [...],    // opcional
  priority: 'high',      // opcional; transacional (default: normal)
  acsLabel: 'reserva-confirmada', // opcional; aparece no log de espera
  waitUntilDone: false,  // opcional; true espera Succeeded do ACS
  onAcsWait: (enviarEm, waitMs, motivo) => { /* fila */ },
});
```

Retorno típico ACS: `{ provider: 'acs', messageId, raw }`.

Se o envio estiver inativo ou incompleto: erro `400` — *"Provedor de e-mail não configurado."* / `503` conforme validação em `email-config.service`.

### Opção BCC (`ocultar_para`)

Com a flag ativa, o destinatário real recebe via BCC e o campo **Para** exibe o remetente (`acs_sender` ou `smtp_from`).

---

## UI admin — Configurações → E-mail

1. Selecionar **Azure ACS**
2. Preencher connection string (mascarada se já existir) e endereço remetente
3. Ativar **Envio de e-mail ativo**
4. Opcional: **Ocultar e-mail do destinatário no campo Para**
5. **Salvar** → toast via `AlertasService`
6. **Testar envio de e-mail** → `POST /email/teste` (auditoria `EMAIL_TESTE_ENVIADO`)

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `ENCRYPTION_KEY` | Sim | Hex ≥ 64 chars — cifra da connection string |
| `EVENT_GRID_WEBHOOK_SECRET` | Para webhook | Secret da subscription Event Grid |
| `EMAIL_PROVIDER` | Não | Fallback `smtp` \| `acs` se ainda não houver valor no BD |
| `EMAIL_OCULTAR_PARA` | Não | Fallback da flag BCC (`1` / `true`) |

Segredos ACS/SMTP **não** devem ir no `.env`.

---

## Checklist de operação

- [ ] Domínio ACS verificado (SPF/DKIM)
- [ ] Connection string e `acs_sender` salvos no admin; envio **ativo**
- [ ] Teste de envio OK
- [ ] (Camarotes) Event Grid → webhook + `EVENT_GRID_WEBHOOK_SECRET`
- [ ] Disparo de alerta registra `message_id` e atualiza para `entregue` / `bounce`
- [ ] Listas de disparo > ~85 destinatários/hora: pedir [aumento de cota ACS](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email/email-quota-increase)

---

## Referências

- [Alertas de Camarotes](./camarotes-alertas.md) — fila ACS, status de entrega, webhook
- [Padrão de módulos admin](./padrao-modulos-admin.md) — shell, modal, alertas
- README do projeto — seção **E-mail (SMTP e Azure ACS)**
