const { getPool } = require('../db/pool');
const {
  toDateStr,
  parseHorarios,
  parsePausas,
  inferPausasFromHorarios,
  coercePausasModeloInclusivo,
  isPastSlot,
} = require('../utils/massagem.util');

function mapEmpresa(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    nm: row.nm,
    cor: row.cor || '#6B7280',
    email: row.email || '',
    ativo: row.ativo == null ? true : !!row.ativo,
  };
}

function mapLayout(row) {
  const defaults = {
    brandNome: 'Bem-estar · Massagem',
    brandIcone: 'leaf',
    home: {
      eyebrow: 'Programa ativo',
      titulo: 'Reserve sua sessão',
      tituloComplemento: 'de',
      tituloDestaque: 'bem-estar',
      subtitulo: 'Escolha o evento e garanta seu horário. Totalmente confidencial.',
      chips: [
        { icone: 'lightning', texto: 'Confirmação imediata' },
        { icone: 'arrows-clockwise', texto: 'Troca de horário livre' },
      ],
    },
  };
  if (!row) return defaults;
  let chips = defaults.home.chips;
  if (row.home_chips != null) {
    try {
      const parsed = typeof row.home_chips === 'string' ? JSON.parse(row.home_chips) : row.home_chips;
      if (Array.isArray(parsed)) chips = parsed;
    } catch {
      /* keep defaults */
    }
  }
  return {
    brandNome: row.brand_nome || defaults.brandNome,
    brandIcone: row.brand_icone || defaults.brandIcone,
    home: {
      eyebrow: row.home_eyebrow ?? defaults.home.eyebrow,
      titulo: row.home_titulo ?? defaults.home.titulo,
      tituloComplemento: row.home_titulo_complemento ?? defaults.home.tituloComplemento,
      tituloDestaque: row.home_titulo_destaque ?? defaults.home.tituloDestaque,
      subtitulo: row.home_subtitulo ?? defaults.home.subtitulo,
      chips,
    },
  };
}

function mapEvento(row) {
  if (!row) return null;
  const horarios = parseHorarios(row.horarios);
  const duracaoMin = Number(row.duracao_min) || 50;
  const pausasSalvas = parsePausas(row.pausas);
  const pausasRaw = pausasSalvas.length ? pausasSalvas : inferPausasFromHorarios(horarios, duracaoMin);
  return {
    id: String(row.id),
    nm: row.nm,
    masso: row.masso,
    local: row.local,
    unidade: row.unidade,
    data: toDateStr(row.data),
    horarios,
    status: row.status,
    duracaoMin,
    pausas: coercePausasModeloInclusivo(pausasRaw, duracaoMin),
    horarioInicio: row.horario_inicio || null,
    horarioFim: row.horario_fim || null,
  };
}

function mapReserva(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventoId: String(row.evento_id),
    data: toDateStr(row.data),
    hora: row.hora,
    userId: row.user_id,
    email: row.email,
    nome: row.nome,
    status: row.status,
    observacao: row.observacao || '',
    lembreteEnviado: !!row.lembrete_enviado,
  };
}

function mapFila(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    evtId: String(row.evento_id),
    email: row.email,
    nome: row.nome,
    userId: row.user_id,
  };
}

async function listEmpresas({ onlyAtivas = false } = {}) {
  const pool = getPool();
  const sql = onlyAtivas
    ? 'SELECT * FROM massagem_empresas WHERE ativo = 1 ORDER BY nm ASC'
    : 'SELECT * FROM massagem_empresas ORDER BY nm ASC';
  const [rows] = await pool.execute(sql);
  return rows.map(mapEmpresa);
}

async function getEmpresa(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM massagem_empresas WHERE id = ? LIMIT 1', [id]);
  return mapEmpresa(rows[0]);
}

async function findEmpresaByNome(nm) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_empresas WHERE LOWER(TRIM(nm)) = LOWER(TRIM(?)) LIMIT 1',
    [nm]
  );
  return mapEmpresa(rows[0]);
}

async function createEmpresa({ nm, cor, email }) {
  const pool = getPool();
  const [result] = await pool.execute(
    'INSERT INTO massagem_empresas (nm, cor, email, ativo) VALUES (?, ?, ?, 1)',
    [nm, cor, email || null]
  );
  return getEmpresa(result.insertId);
}

async function updateEmpresa(id, { nm, cor, email, ativo }) {
  const pool = getPool();
  const atual = await getEmpresa(id);
  if (!atual) return null;
  await pool.execute(
    'UPDATE massagem_empresas SET nm = ?, cor = ?, email = ?, ativo = ? WHERE id = ?',
    [
      nm != null ? nm : atual.nm,
      cor != null ? cor : atual.cor,
      email !== undefined ? email || null : atual.email || null,
      ativo != null ? (ativo ? 1 : 0) : atual.ativo ? 1 : 0,
      id,
    ]
  );
  return getEmpresa(id);
}

async function removeEmpresa(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM massagem_empresas WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function getLayout() {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM massagem_layout WHERE id = 1 LIMIT 1');
  return mapLayout(rows[0]);
}

async function saveLayout(layout) {
  const pool = getPool();
  const chips = JSON.stringify(layout.home?.chips || []);
  await pool.execute(
    `INSERT INTO massagem_layout (
      id, brand_nome, brand_icone, home_eyebrow, home_titulo,
      home_titulo_complemento, home_titulo_destaque, home_subtitulo, home_chips
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      brand_nome = VALUES(brand_nome),
      brand_icone = VALUES(brand_icone),
      home_eyebrow = VALUES(home_eyebrow),
      home_titulo = VALUES(home_titulo),
      home_titulo_complemento = VALUES(home_titulo_complemento),
      home_titulo_destaque = VALUES(home_titulo_destaque),
      home_subtitulo = VALUES(home_subtitulo),
      home_chips = VALUES(home_chips)`,
    [
      layout.brandNome,
      layout.brandIcone,
      layout.home.eyebrow,
      layout.home.titulo,
      layout.home.tituloComplemento,
      layout.home.tituloDestaque,
      layout.home.subtitulo,
      chips,
    ]
  );
  return getLayout();
}

async function listEventos({ all = false } = {}) {
  const pool = getPool();
  const sql = all
    ? 'SELECT * FROM massagem_eventos ORDER BY data ASC, id ASC'
    : "SELECT * FROM massagem_eventos WHERE status = 'ativo' ORDER BY data ASC, id ASC";
  const [rows] = await pool.execute(sql);
  return rows.map(mapEvento);
}

async function getEvento(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM massagem_eventos WHERE id = ? LIMIT 1', [id]);
  return mapEvento(rows[0]);
}

async function createEvento(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO massagem_eventos
      (nm, masso, local, unidade, data, horarios, status, duracao_min, pausas, horario_inicio, horario_fim)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.nm,
      data.masso,
      data.local,
      data.unidade,
      data.data,
      JSON.stringify(data.horarios),
      data.status || 'inativo',
      data.duracaoMin || 50,
      JSON.stringify(data.pausas || []),
      data.horarioInicio || null,
      data.horarioFim || null,
    ]
  );
  return getEvento(result.insertId);
}

async function updateEvento(id, patch) {
  const atual = await getEvento(id);
  if (!atual) return null;
  const pool = getPool();
  const next = {
    nm: patch.nm != null ? patch.nm : atual.nm,
    masso: patch.masso != null ? patch.masso : atual.masso,
    local: patch.local != null ? patch.local : atual.local,
    unidade: patch.unidade != null ? patch.unidade : atual.unidade,
    data: patch.data != null ? patch.data : atual.data,
    horarios: patch.horarios != null ? patch.horarios : atual.horarios,
    status: patch.status != null ? patch.status : atual.status,
    duracaoMin: patch.duracaoMin != null ? patch.duracaoMin : atual.duracaoMin,
    pausas: patch.pausas != null ? patch.pausas : atual.pausas,
    horarioInicio: patch.horarioInicio !== undefined ? patch.horarioInicio : atual.horarioInicio,
    horarioFim: patch.horarioFim !== undefined ? patch.horarioFim : atual.horarioFim,
  };
  await pool.execute(
    `UPDATE massagem_eventos
     SET nm = ?, masso = ?, local = ?, unidade = ?, data = ?, horarios = ?, status = ?, duracao_min = ?,
         pausas = ?, horario_inicio = ?, horario_fim = ?
     WHERE id = ?`,
    [
      next.nm,
      next.masso,
      next.local,
      next.unidade,
      next.data,
      JSON.stringify(next.horarios),
      next.status,
      next.duracaoMin,
      JSON.stringify(next.pausas || []),
      next.horarioInicio || null,
      next.horarioFim || null,
      id,
    ]
  );
  return getEvento(id);
}

async function removeEvento(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM massagem_eventos WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function listReservasByEvento(eventoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_reservas WHERE evento_id = ? ORDER BY hora ASC',
    [eventoId]
  );
  return rows.map(mapReserva);
}

async function listReservasByEmail(email) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_reservas WHERE LOWER(email) = LOWER(?) ORDER BY data ASC, hora ASC',
    [email]
  );
  return rows.map(mapReserva);
}

async function getReservaBySlot(eventoId, data, hora) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_reservas WHERE evento_id = ? AND data = ? AND hora = ? LIMIT 1',
    [eventoId, data, hora]
  );
  return mapReserva(rows[0]);
}

async function getReservaAtivaUsuarioNoDia(email, eventoId, data) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM massagem_reservas
     WHERE evento_id = ? AND data = ? AND LOWER(email) = LOWER(?) AND status <> 'falta'
     LIMIT 1`,
    [eventoId, data, email]
  );
  return mapReserva(rows[0]);
}

async function getReservaAtivaUsuario(email) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT r.*, e.nm AS evento_nm, e.unidade AS evento_unidade
     FROM massagem_reservas r
     INNER JOIN massagem_eventos e ON e.id = r.evento_id
     WHERE LOWER(r.email) = LOWER(?) AND r.status = 'ok' AND r.data >= CURDATE()
     ORDER BY r.data ASC, r.hora ASC`,
    [email]
  );
  const mapped = rows.map((row) => ({
    ...mapReserva(row),
    eventoNm: row.evento_nm || '',
    unidade: row.evento_unidade || '',
  }));
  return mapped.find((r) => !isPastSlot(r.data, r.hora)) || null;
}

async function getReservaUsuarioNoDia(email, data) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT r.*, e.nm AS evento_nm, e.unidade AS evento_unidade
     FROM massagem_reservas r
     INNER JOIN massagem_eventos e ON e.id = r.evento_id
     WHERE LOWER(r.email) = LOWER(?) AND r.data = ? AND r.status IN ('ok', 'presente')
     LIMIT 1`,
    [email, toDateStr(data)]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapReserva(row),
    eventoNm: row.evento_nm || '',
    unidade: row.evento_unidade || '',
  };
}

async function upsertReserva({ eventoId, data, hora, userId, email, nome, status, observacao }) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO massagem_reservas (evento_id, data, hora, user_id, email, nome, status, observacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       email = VALUES(email),
       nome = VALUES(nome),
       status = VALUES(status),
       observacao = VALUES(observacao),
       lembrete_enviado = 0`,
    [eventoId, data, hora, userId || null, email, nome, status || 'ok', observacao || '']
  );
  return getReservaBySlot(eventoId, data, hora);
}

async function deleteReserva(eventoId, data, hora) {
  const pool = getPool();
  const [result] = await pool.execute(
    'DELETE FROM massagem_reservas WHERE evento_id = ? AND data = ? AND hora = ?',
    [eventoId, data, hora]
  );
  return result.affectedRows > 0;
}

async function updateReservaStatus(eventoId, data, hora, status) {
  const pool = getPool();
  await pool.execute(
    'UPDATE massagem_reservas SET status = ? WHERE evento_id = ? AND data = ? AND hora = ?',
    [status, eventoId, data, hora]
  );
  return getReservaBySlot(eventoId, data, hora);
}

async function countReservasAtivas() {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM massagem_reservas WHERE status <> 'falta'"
  );
  return Number(rows[0]?.total) || 0;
}

async function countReservasByStatus(status) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM massagem_reservas WHERE status = ?',
    [status]
  );
  return Number(rows[0]?.total) || 0;
}

async function countReservasEvento(eventoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM massagem_reservas WHERE evento_id = ?',
    [eventoId]
  );
  return Number(rows[0]?.total) || 0;
}

async function listFilaByEvento(eventoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_fila WHERE evento_id = ? ORDER BY id ASC',
    [eventoId]
  );
  return rows.map(mapFila);
}

async function countFila() {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT COUNT(*) AS total FROM massagem_fila');
  return Number(rows[0]?.total) || 0;
}

async function getFilaItem(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM massagem_fila WHERE id = ? LIMIT 1', [id]);
  return mapFila(rows[0]);
}

async function getFilaUsuario(email, eventoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_fila WHERE evento_id = ? AND LOWER(email) = LOWER(?) LIMIT 1',
    [eventoId, email]
  );
  return mapFila(rows[0]);
}

async function enterFila({ eventoId, userId, email, nome }) {
  const pool = getPool();
  const [result] = await pool.execute(
    'INSERT INTO massagem_fila (evento_id, user_id, email, nome) VALUES (?, ?, ?, ?)',
    [eventoId, userId || null, email, nome]
  );
  return getFilaItem(result.insertId);
}

async function leaveFila(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM massagem_fila WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function removeFilaByEventoEmail(email, eventoId) {
  const pool = getPool();
  const [result] = await pool.execute(
    'DELETE FROM massagem_fila WHERE evento_id = ? AND LOWER(email) = LOWER(?)',
    [eventoId, email]
  );
  return result.affectedRows > 0;
}

async function listLembretesPendentes() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT r.*, e.nm AS evento_nm, e.local AS evento_local, e.masso AS evento_masso,
            e.unidade AS evento_unidade, e.duracao_min AS evento_duracao_min
     FROM massagem_reservas r
     JOIN massagem_eventos e ON e.id = r.evento_id
     WHERE r.status = 'ok' AND r.lembrete_enviado = 0`
  );
  return rows.map((row) => ({
    ...mapReserva(row),
    evento: {
      id: String(row.evento_id),
      nm: row.evento_nm,
      local: row.evento_local,
      masso: row.evento_masso,
      unidade: row.evento_unidade,
      duracaoMin: Number(row.evento_duracao_min) || 50,
    },
  }));
}

async function markLembreteEnviado(eventoId, data, hora) {
  const pool = getPool();
  await pool.execute(
    'UPDATE massagem_reservas SET lembrete_enviado = 1 WHERE evento_id = ? AND data = ? AND hora = ?',
    [eventoId, data, hora]
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailsTeste(raw) {
  let list = raw;
  if (list == null) return [];
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const email = String(item || '')
      .trim()
      .toLowerCase();
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function mapConfig(row) {
  return {
    emailsTeste: normalizeEmailsTeste(row?.emails_teste),
  };
}

async function getConfig() {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM massagem_config WHERE id = 1 LIMIT 1');
  if (!rows[0]) {
    await pool.execute(
      'INSERT IGNORE INTO massagem_config (id, emails_teste) VALUES (1, JSON_ARRAY())'
    );
    return { emailsTeste: [] };
  }
  return mapConfig(rows[0]);
}

async function getEmailsTeste() {
  const cfg = await getConfig();
  return cfg.emailsTeste;
}

async function saveConfig({ emailsTeste }) {
  const pool = getPool();
  const normalized = normalizeEmailsTeste(emailsTeste);
  await pool.execute(
    `INSERT INTO massagem_config (id, emails_teste) VALUES (1, ?)
     ON DUPLICATE KEY UPDATE emails_teste = VALUES(emails_teste)`,
    [JSON.stringify(normalized)]
  );
  return getConfig();
}

function mapEmailTemplate(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    codigo: row.codigo,
    nome: row.nome,
    assunto: row.assunto,
    html: row.html,
    texto: row.texto || '',
    ativo: row.ativo == null ? true : !!row.ativo,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

async function listEmailTemplates() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_email_templates ORDER BY nome ASC'
  );
  return rows.map(mapEmailTemplate);
}

async function getEmailTemplate(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_email_templates WHERE id = ? LIMIT 1',
    [id]
  );
  return mapEmailTemplate(rows[0]);
}

async function findEmailTemplateByCodigo(codigo, { onlyAtivo = false } = {}) {
  const pool = getPool();
  const sql = onlyAtivo
    ? 'SELECT * FROM massagem_email_templates WHERE codigo = ? AND ativo = 1 ORDER BY atualizado_em DESC LIMIT 1'
    : 'SELECT * FROM massagem_email_templates WHERE codigo = ? ORDER BY atualizado_em DESC LIMIT 1';
  const [rows] = await pool.execute(sql, [codigo]);
  return mapEmailTemplate(rows[0]);
}

async function createEmailTemplate({ id, codigo, nome, assunto, html, texto, ativo }) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO massagem_email_templates (id, codigo, nome, assunto, html, texto, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, codigo, nome, assunto, html, texto || null, ativo ? 1 : 0]
  );
  return getEmailTemplate(id);
}

async function updateEmailTemplate(id, { nome, assunto, html, texto, ativo }) {
  const atual = await getEmailTemplate(id);
  if (!atual) return null;
  const pool = getPool();
  await pool.execute(
    `UPDATE massagem_email_templates
     SET nome = ?, assunto = ?, html = ?, texto = ?, ativo = ?
     WHERE id = ?`,
    [
      nome != null ? nome : atual.nome,
      assunto != null ? assunto : atual.assunto,
      html != null ? html : atual.html,
      texto !== undefined ? texto || null : atual.texto || null,
      ativo != null ? (ativo ? 1 : 0) : atual.ativo ? 1 : 0,
      id,
    ]
  );
  return getEmailTemplate(id);
}

async function removeEmailTemplate(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM massagem_email_templates WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

function mapLista(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    empresaId: String(row.empresa_id),
    empresaNm: row.empresa_nm || '',
    nome: row.nome,
    descricao: row.descricao || '',
    emailGrupo: row.email_grupo || '',
    totalEmails: Number(row.total_emails) || 0,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

function mapListaItem(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    listaId: String(row.lista_id),
    email: row.email,
    nome: row.nome || '',
    criadoEm: row.criado_em,
  };
}

const LISTA_SELECT = `SELECT l.*, e.nm AS empresa_nm,
  (SELECT COUNT(*) FROM massagem_email_lista_itens i WHERE i.lista_id = l.id) AS total_emails,
  (SELECT i.email FROM massagem_email_lista_itens i WHERE i.lista_id = l.id ORDER BY i.id ASC LIMIT 1) AS email_grupo
 FROM massagem_email_listas l
 INNER JOIN massagem_empresas e ON e.id = l.empresa_id`;

async function listListas() {
  const pool = getPool();
  const [rows] = await pool.execute(`${LISTA_SELECT} ORDER BY e.nm ASC, l.nome ASC`);
  return rows.map(mapLista);
}

async function getLista(id) {
  const pool = getPool();
  const [rows] = await pool.execute(`${LISTA_SELECT} WHERE l.id = ? LIMIT 1`, [id]);
  return mapLista(rows[0]);
}

async function findListaByEmpresaId(empresaId) {
  const list = await listListasByEmpresaId(empresaId);
  return list[0] || null;
}

async function listListasByEmpresaId(empresaId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${LISTA_SELECT} WHERE l.empresa_id = ? ORDER BY l.nome ASC`,
    [empresaId]
  );
  return rows.map(mapLista);
}

async function createLista({ empresaId, nome, descricao, email, nomeContato }) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO massagem_email_listas (empresa_id, nome, descricao) VALUES (?, ?, ?)',
      [empresaId, nome, descricao || null]
    );
    const listaId = result.insertId;
    if (email) {
      await conn.execute(
        'INSERT INTO massagem_email_lista_itens (lista_id, email, nome) VALUES (?, ?, ?)',
        [listaId, email, nomeContato || null]
      );
      await conn.execute('UPDATE massagem_empresas SET email = ? WHERE id = ?', [email, empresaId]);
    }
    await conn.commit();
    return getLista(listaId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateLista(id, { nome, descricao }) {
  const atual = await getLista(id);
  if (!atual) return null;
  const pool = getPool();
  await pool.execute('UPDATE massagem_email_listas SET nome = ?, descricao = ? WHERE id = ?', [
    nome != null ? nome : atual.nome,
    descricao !== undefined ? descricao || null : atual.descricao || null,
    id,
  ]);
  return getLista(id);
}

async function removeLista(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM massagem_email_listas WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function listListaItens(listaId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_email_lista_itens WHERE lista_id = ? ORDER BY nome ASC, email ASC',
    [listaId]
  );
  return rows.map(mapListaItem);
}

async function getListaItem(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM massagem_email_lista_itens WHERE id = ? LIMIT 1',
    [id]
  );
  return mapListaItem(rows[0]);
}

async function addListaItem({ listaId, email, nome }) {
  const pool = getPool();
  const [result] = await pool.execute(
    'INSERT INTO massagem_email_lista_itens (lista_id, email, nome) VALUES (?, ?, ?)',
    [listaId, email, nome || null]
  );
  return getListaItem(result.insertId);
}

async function removeListaItem(listaId, itemId) {
  const pool = getPool();
  const [result] = await pool.execute(
    'DELETE FROM massagem_email_lista_itens WHERE id = ? AND lista_id = ?',
    [itemId, listaId]
  );
  return result.affectedRows > 0;
}

async function listaTemEmail(listaId, email) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT id FROM massagem_email_lista_itens WHERE lista_id = ? AND LOWER(email) = LOWER(?) LIMIT 1',
    [listaId, email]
  );
  return !!rows[0];
}

function mapEmailEnvio(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    tipo: row.tipo,
    origem: row.origem,
    modo: row.modo,
    eventoId: row.evento_id != null ? String(row.evento_id) : null,
    eventoNm: row.evento_nm || '',
    eventoData: toDateStr(row.evento_data) || '',
    assunto: row.assunto || '',
    total: Number(row.total) || 0,
    enviados: Number(row.enviados) || 0,
    falhas: Number(row.falhas) || 0,
    status: row.status,
    criadoEm: row.criado_em,
    destinos: [],
  };
}

function mapEmailEnvioDestino(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    envioId: String(row.envio_id),
    email: row.email,
    nome: row.nome || '',
    status: row.status,
    erro: row.erro || '',
    messageId: row.message_id || null,
    enviadoEm: row.enviado_em,
  };
}

function eventoIdNum(eventoId) {
  const n = Number(eventoId);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function createEmailEnvio({
  tipo,
  origem,
  modo,
  eventoId,
  eventoNm,
  eventoData,
  assunto,
  total = 0,
}) {
  const pool = getPool();
  const data = toDateStr(eventoData) || null;
  const [result] = await pool.execute(
    `INSERT INTO massagem_email_envios
      (tipo, origem, modo, evento_id, evento_nm, evento_data, assunto, total, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'enviando')`,
    [
      tipo,
      origem,
      modo || 'direto',
      eventoIdNum(eventoId),
      eventoNm || null,
      data || null,
      assunto || null,
      Number(total) || 0,
    ]
  );
  return { id: String(result.insertId) };
}

async function addEmailEnvioDestino({ envioId, email, nome, status, erro, messageId }) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO massagem_email_envio_destinos
      (envio_id, email, nome, status, erro, message_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [envioId, email, nome || null, status, erro || null, messageId || null]
  );
}

async function finishEmailEnvio(envioId, { total, enviados, falhas, status }) {
  const pool = getPool();
  await pool.execute(
    `UPDATE massagem_email_envios
     SET total = ?, enviados = ?, falhas = ?, status = ?
     WHERE id = ?`,
    [Number(total) || 0, Number(enviados) || 0, Number(falhas) || 0, status, envioId]
  );
}

async function listEmailEnvios({ email = '', tipo = '', limit = 50 } = {}) {
  const pool = getPool();
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const params = [];
  let sql = 'SELECT * FROM massagem_email_envios';
  const where = [];
  const tipoOk = String(tipo || '').trim();
  if (tipoOk) {
    where.push('tipo = ?');
    params.push(tipoOk);
  }
  const emailQ = String(email || '').trim().toLowerCase();
  if (emailQ) {
    where.push(
      `id IN (
        SELECT envio_id FROM massagem_email_envio_destinos
        WHERE LOWER(email) LIKE ?
      )`
    );
    params.push(`%${emailQ}%`);
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY criado_em DESC, id DESC LIMIT ${lim}`;

  const [rows] = await pool.execute(sql, params);
  const envios = rows.map(mapEmailEnvio);
  if (!envios.length) return envios;

  const ids = envios.map((e) => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const [destRows] = await pool.execute(
    `SELECT * FROM massagem_email_envio_destinos
     WHERE envio_id IN (${placeholders})
     ORDER BY id ASC`,
    ids
  );
  const byEnvio = new Map(envios.map((e) => [e.id, e]));
  for (const row of destRows) {
    const dest = mapEmailEnvioDestino(row);
    const envio = byEnvio.get(dest.envioId);
    if (envio) envio.destinos.push(dest);
  }
  return envios;
}

module.exports = {
  listEmpresas,
  getEmpresa,
  findEmpresaByNome,
  createEmpresa,
  updateEmpresa,
  removeEmpresa,
  getLayout,
  saveLayout,
  getConfig,
  getEmailsTeste,
  saveConfig,
  listEmailTemplates,
  getEmailTemplate,
  findEmailTemplateByCodigo,
  createEmailTemplate,
  updateEmailTemplate,
  removeEmailTemplate,
  listEventos,
  getEvento,
  createEvento,
  updateEvento,
  removeEvento,
  listReservasByEvento,
  listReservasByEmail,
  getReservaBySlot,
  getReservaAtivaUsuarioNoDia,
  getReservaAtivaUsuario,
  getReservaUsuarioNoDia,
  upsertReserva,
  deleteReserva,
  updateReservaStatus,
  countReservasAtivas,
  countReservasByStatus,
  countReservasEvento,
  listFilaByEvento,
  countFila,
  getFilaItem,
  getFilaUsuario,
  enterFila,
  leaveFila,
  removeFilaByEventoEmail,
  listLembretesPendentes,
  markLembreteEnviado,
  listListas,
  getLista,
  findListaByEmpresaId,
  listListasByEmpresaId,
  createLista,
  updateLista,
  removeLista,
  listListaItens,
  getListaItem,
  addListaItem,
  removeListaItem,
  listaTemEmail,
  createEmailEnvio,
  addEmailEnvioDestino,
  finishEmailEnvio,
  listEmailEnvios,
};
