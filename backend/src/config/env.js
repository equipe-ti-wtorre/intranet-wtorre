require('dotenv').config();
const os = require('os');
const path = require('path');

function requireEnv(name, minLength = 1) {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`Variável de ambiente obrigatória: ${name}`);
  }
  return value;
}

function getCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || 'http://localhost:4201';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

const env = {
  port: Number(process.env.PORT) || 3001,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'intranet',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'intranet_wtorre',
  },
  jwtSecret: process.env.JWT_SECRET,
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '30m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  encryptionKey: process.env.ENCRYPTION_KEY,
  corsOrigins: getCorsOrigins(),
  msalRedirectUriWeb: process.env.MSAL_REDIRECT_URI_WEB || 'http://localhost:4201',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@grupowtorre.com',
  adminPassword: process.env.ADMIN_PASSWORD,
  rateLimitAuthMax: Number(process.env.RATE_LIMIT_AUTH_MAX) || 30,
  rateLimitAuthWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 900000,
  storageDir:
    process.env.STORAGE_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'documentos'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 50,
  ramalAdField: process.env.RAMAL_AD_FIELD || 'businessPhones',
  graphSchemaExtensionId: process.env.GRAPH_SCHEMA_EXTENSION_ID || 'IntranetWtColaborador',
  graphSchemaExtensionSkipRegister:
    process.env.GRAPH_SCHEMA_EXTENSION_SKIP_REGISTER === '1' ||
    process.env.GRAPH_SCHEMA_EXTENSION_SKIP_REGISTER === 'true',
  syncColaboradoresMin: Number(process.env.SYNC_COLABORADORES_MIN) || 60,
  colaboradoresFotosDir:
    process.env.COLABORADORES_FOTOS_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'colaboradores-fotos'),
  azureStorageAccount: process.env.AZURE_STORAGE_ACCOUNT,
  treinamentosContainer: process.env.TREINAMENTOS_CONTAINER || 'treinamentos',
  treinamentosSasTtlMin: Number(process.env.TREINAMENTOS_SAS_TTL_MIN) || 120,
  treinamentosMaxMb: Number(process.env.TREINAMENTOS_MAX_MB) || 1024,
  treinamentosTmpDir: process.env.TREINAMENTOS_TMP_DIR || os.tmpdir(),
  grupoLogosDir:
    process.env.GRUPO_LOGOS_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'grupo-logos'),
  grupoLogosUploadMaxMb: Number(process.env.GRUPO_LOGOS_UPLOAD_MAX_MB) || 2,
  documentosPaginasLogosDir:
    process.env.DOCUMENTOS_PAGINAS_LOGOS_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'documentos-paginas-logos'),
  documentosPaginasLogoUploadMaxMb:
    Number(process.env.DOCUMENTOS_PAGINAS_LOGO_UPLOAD_MAX_MB) || 2,
  iconesCustomDir:
    process.env.ICONES_CUSTOM_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'icones-custom'),
  iconesCustomUploadMaxKb: Number(process.env.ICONES_CUSTOM_UPLOAD_MAX_KB) || 256,
  documentosThumbsDir:
    process.env.DOCUMENTOS_THUMBS_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'documentos-thumbs'),
  documentosThumbUploadMaxMb: Number(process.env.DOCUMENTOS_THUMB_UPLOAD_MAX_MB) || 2,
  homeCarrosselDir:
    process.env.HOME_CARROSSEL_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'home-carrossel'),
  homeCarrosselUploadMaxMb: Number(process.env.HOME_CARROSSEL_UPLOAD_MAX_MB) || 8,
  salasLogosDir:
    process.env.SALAS_LOGOS_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'salas-logos'),
  salasSyncDataDir: process.env.SALAS_SYNC_DATA_DIR || '',
  paginasImagensContainer: process.env.PAGINAS_IMAGENS_CONTAINER || 'paginas',
  /** Tamanho máximo do arquivo enviado ao Blob (após compressão). */
  paginasImagensMaxMb: Number(process.env.PAGINAS_IMAGENS_MAX_MB) || 5,
  /** Limite do upload HTTP (antes da compressão no servidor). */
  paginasImagensUploadMaxMb: Number(process.env.PAGINAS_IMAGENS_UPLOAD_MAX_MB) || 25,
  paginasImagensTmpDir: process.env.PAGINAS_IMAGENS_TMP_DIR || os.tmpdir(),
  camarotesFileShareUrl: process.env.CAMAROTES_FILE_SHARE_URL || '',
  camarotesSheetCamarote: process.env.CAMAROTES_SHEET_CAMAROTE || 'Camarotes',
  camarotesMailer: process.env.CAMAROTES_MAILER || 'microservice',
  camarotesMailServiceUrl: process.env.CAMAROTES_MAIL_SERVICE_URL || '',
  camarotesMailFrom: process.env.CAMAROTES_MAIL_FROM || '',
  camarotesMailBatchSize: Number(process.env.CAMAROTES_MAIL_BATCH_SIZE) || 10,
  camarotesMailBatchDelayMs: Number(process.env.CAMAROTES_MAIL_BATCH_DELAY_MS) || 2000,
  solicitacaoColaboradorContainer:
    process.env.SOLICITACAO_COLABORADOR_CONTAINER || 'solicitacao-colaborador',
  solicitacaoColaboradorTmpDir:
    process.env.SOLICITACAO_COLABORADOR_TMP_DIR || os.tmpdir(),
  solicitacaoColaboradorFotoMaxMb: Number(process.env.SOLICITACAO_FOTO_MAX_MB) || 5,
  solicitacaoColaboradorArquivoMaxMb: Number(process.env.SOLICITACAO_ARQUIVO_MAX_MB) || 10,
  solicitacaoColaboradorSmtpAnexoMaxMb:
    Number(process.env.SOLICITACAO_SMTP_ANEXO_MAX_MB) || 25,
  emailProvider: process.env.EMAIL_PROVIDER === 'acs' ? 'acs' : 'smtp',
  emailOcultarPara: process.env.EMAIL_OCULTAR_PARA === '1' || process.env.EMAIL_OCULTAR_PARA === 'true',
  eventGridWebhookSecret: process.env.EVENT_GRID_WEBHOOK_SECRET || '',
  eventosCacheTtlMin: Number(process.env.EVENTOS_CACHE_TTL_MIN) || 60,
  eventosLimite: Number(process.env.EVENTOS_LIMITE) || 6,
  eventosAgendaLimite: Number(process.env.EVENTOS_AGENDA_LIMITE) || 60,
  eventosFontesLogosDir:
    process.env.EVENTOS_FONTES_LOGOS_DIR ||
    path.join(__dirname, '..', '..', 'storage', 'eventos-fontes-logos'),
  eventosFontesLogoUploadMaxMb:
    Number(process.env.EVENTOS_FONTES_LOGO_UPLOAD_MAX_MB) || 2,
  pbiEnabled:
    process.env.PBI_ENABLED === '1' || process.env.PBI_ENABLED === 'true',
  pbiTenantId: process.env.PBI_TENANT_ID || '',
  pbiClientId: process.env.PBI_CLIENT_ID || '',
  pbiClientSecret: process.env.PBI_CLIENT_SECRET || '',
  pbiWorkspaceId: process.env.PBI_WORKSPACE_ID || '',
  pbiRlsMode: process.env.PBI_RLS_MODE === 'dynamic' ? 'dynamic' : 'static',
  pbiRlsDynamicRole: process.env.PBI_RLS_DYNAMIC_ROLE || '',
  pbiSpTokenCacheMin: Number(process.env.PBI_SP_TOKEN_CACHE_MIN) || 50,
  pbiEmbedTokenCacheMin: Number(process.env.PBI_EMBED_TOKEN_CACHE_MIN) || 55,
  pbiEmbedRateLimitMax: Number(process.env.PBI_EMBED_RATE_LIMIT_MAX) || 30,
  pbiEmbedRateLimitWindowMs: Number(process.env.PBI_EMBED_RATE_LIMIT_WINDOW_MS) || 900000,
};

function validateEnv() {
  requireEnv('JWT_SECRET', 32);
  requireEnv('ENCRYPTION_KEY', 64);
  requireEnv('AZURE_STORAGE_ACCOUNT');
  if (env.pbiEnabled) {
    requireEnv('PBI_TENANT_ID');
    requireEnv('PBI_CLIENT_ID');
    requireEnv('PBI_CLIENT_SECRET');
    requireEnv('PBI_WORKSPACE_ID');
    if (env.pbiRlsMode === 'dynamic') {
      requireEnv('PBI_RLS_DYNAMIC_ROLE');
    }
  }
}

module.exports = { env, validateEnv, requireEnv };
