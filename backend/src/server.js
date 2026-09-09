const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { env, validateEnv } = require('./config/env');
const requestIdMiddleware = require('./middleware/requestId.middleware');
const authRoutes = require('./routes/auth.routes');
const tenantsRoutes = require('./routes/tenants.routes');
const menuRoutes = require('./routes/menu.routes');
const docCategoriasRoutes = require('./routes/doc-categorias.routes');
const documentosRoutes = require('./routes/documentos.routes');
const colaboradoresRoutes = require('./routes/colaboradores.routes');
const aniversariantesRoutes = require('./routes/aniversariantes.routes');
const assinaturasRoutes = require('./routes/assinaturas.routes');
const storageContainersRoutes = require('./routes/storage-containers.routes');
const treinamentosRoutes = require('./routes/treinamentos.routes');
const perfisAcessoRoutes = require('./routes/perfis-acesso.routes');
const configuracoesRoutes = require('./routes/configuracoes.routes');
const rodapeRoutes = require('./routes/rodape.routes');
const paginasRoutes = require('./routes/paginas.routes');
const camarotesRoutes = require('./routes/camarotes.routes');
const webhooksRoutes = require('./routes/webhooks.routes');
const solicitacaoColaboradorRoutes = require('./routes/solicitacao-colaborador.routes');
const contentVersionRoutes = require('./routes/content-version.routes');
const brandingRoutes = require('./routes/branding.routes');
const grupoLogosRoutes = require('./routes/grupo-logos.routes');
const iconesRoutes = require('./routes/icones.routes');
const comunicadosRoutes = require('./routes/comunicados.routes');
const eventosRoutes = require('./routes/eventos.routes');
const bidRoutes = require('./routes/bid.routes');
const powerbiRoutes = require('./routes/powerbi.routes');
const salasRoutes = require('./routes/salas.routes');
const followupRoutes = require('./routes/followup.routes');
const massagemRoutes = require('./routes/massagem.routes');
const pesquisasRoutes = require('./routes/pesquisas.routes');
const tabletRoutes = require('./routes/tablet.routes');
const ramalRoutes = require('./routes/ramal.routes');
const assinaturasController = require('./controllers/assinaturas.controller');
const { agendarSincronizacaoColaboradores } = require('./services/colaboradores.sync');
const { agendarJobsCamarotes } = require('./services/camarotes-cron.service');
const { agendarJobsBid } = require('./services/bid-cron.service');
const { agendarJobsFollowup } = require('./services/followup-cron.service');
const { agendarLembretesMassagem } = require('./services/massagem-lembrete.service');
const { reconcileAll } = require('./services/doc-pagina-menu.sync');
const { ensureFotosDir } = require('./controllers/colaboradores.controller');
const { ensureGrupoLogosDir } = require('./config/grupo-logos-upload');
const { ensureHomeCarrosselDir } = require('./config/home-carrossel-upload');
const { ensureDocumentosPaginasLogosDir } = require('./config/documentos-paginas-logo-upload');
const { ensureIconesCustomDir } = require('./config/icones-custom-upload');

try {
  validateEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  })
);

app.use('/api/v1/webhooks', webhooksRoutes);

app.use(express.json());
app.use(requestIdMiddleware);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', servico: 'intranet-wtorre-api', version: 'v1' });
});

app.use('/api/v1/branding', brandingRoutes);
app.use('/api/v1/grupo-logos', grupoLogosRoutes);
app.use('/api/v1/icones', iconesRoutes);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tenants', tenantsRoutes);
app.use('/api/v1/menu', menuRoutes);
app.use('/api/v1/doc-categorias', docCategoriasRoutes);
app.use('/api/v1/documentos', documentosRoutes);
app.use('/api/v1/colaboradores', colaboradoresRoutes);
app.use('/api/v1/aniversariantes', aniversariantesRoutes);
app.use('/api/v1/containers', storageContainersRoutes);
app.use('/api/v1/treinamentos', treinamentosRoutes);
app.use('/api/v1/perfis-acesso', perfisAcessoRoutes);
app.use('/api/v1/configuracoes', configuracoesRoutes);
app.use('/api/v1/rodape', rodapeRoutes);
app.use('/api/v1/paginas', paginasRoutes);
app.use('/api/v1/camarotes', camarotesRoutes);
app.use('/api/v1/solicitacao-colaborador', solicitacaoColaboradorRoutes);
app.use('/api/v1/content-version', contentVersionRoutes);
app.use('/api/v1/comunicados', comunicadosRoutes);
app.use('/api/v1/eventos', eventosRoutes);
app.use('/api/v1/bid', bidRoutes);
app.use('/api/v1/powerbi', powerbiRoutes);
app.use('/api/v1/salas', salasRoutes);
app.use('/api/v1/followup', followupRoutes);
app.use('/api/v1/massagem', massagemRoutes);
app.use('/api/v1/pesquisas', pesquisasRoutes);
app.use('/api/v1/tablet', tabletRoutes);
app.use('/api/v1/ramal', ramalRoutes);

// Rotas públicas de assinaturas (sem JWT — usadas pelo instalador antes de qualquer login)
app.get('/api/v1/assinaturas/script/instalar', assinaturasController.obterScriptBase);
app.get('/api/v1/assinaturas/instalar-assinaturas.ps1', assinaturasController.obterScriptBase);
app.get('/api/v1/assinaturas/instalar-assinaturas-base.ps1', assinaturasController.obterScriptBase);
app.get('/api/v1/assinaturas/config/:token', assinaturasController.obterConfig);
app.get('/api/v1/assinaturas/fonts/:filename', assinaturasController.servirFonte);

app.use('/api/v1/assinaturas', assinaturasRoutes);

app.use((_req, res) => {
  res.status(404).json({ mensagem: 'Rota não encontrada.' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ mensagem: 'Erro interno do servidor.' });
});

app.listen(env.port, () => {
  console.log(`API Intranet WTorre rodando em http://127.0.0.1:${env.port}`);
  try {
    ensureFotosDir();
  } catch (err) {
    console.error('[colaboradores] Não foi possível criar pasta de cache de fotos:', err.message);
  }
  try {
    ensureGrupoLogosDir();
  } catch (err) {
    console.error('[topbar] Não foi possível preparar pasta de logos:', err.message);
  }
  try {
    ensureHomeCarrosselDir();
  } catch (err) {
    console.error('[carrossel] Não foi possível preparar pasta de imagens:', err.message);
  }
  try {
    ensureDocumentosPaginasLogosDir();
  } catch (err) {
    console.error('[documentos] Não foi possível preparar pasta de logos de entidades:', err.message);
  }
  try {
    ensureIconesCustomDir();
  } catch (err) {
    console.error('[icones] Não foi possível preparar pasta de ícones personalizados:', err.message);
  }
  reconcileAll()
    .then((count) => console.log(`[documentos] Menu sincronizado com ${count} página(s).`))
    .catch((err) => console.error('[documentos] Falha ao sincronizar menu de páginas:', err.message));
  agendarSincronizacaoColaboradores();
  agendarJobsCamarotes();
  agendarJobsBid();
  agendarJobsFollowup();
  agendarLembretesMassagem();
});
