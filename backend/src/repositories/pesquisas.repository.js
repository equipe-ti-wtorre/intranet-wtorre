const { getPool } = require('../db/pool');

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toDateStr(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function fromPrazoKey(value) {
  if (value == null || value === '') return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length >= 12) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}`;
  }
  const m = String(value)
    .trim()
    .replace(' ', 'T')
    .match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[1]}T${m[2]}:${m[3]}` : null;
}

function nowSaoPauloSql() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapFormulario(row) {
  if (!row) return null;
  return {
    id: row.id,
    criadorId: row.criador_id,
    criadorNome: row.criador_nome || null,
    titulo: row.titulo,
    descricao: row.descricao || '',
    categoria: row.categoria,
    prazo: toDateStr(row.prazo),
    prazoInicio: fromPrazoKey(row.prazo_inicio_key),
    prazoFim: fromPrazoKey(row.prazo_fim_key),
    publicoAlvo: row.publico_alvo,
    publicoDepartamento: row.publico_departamento || null,
    tipo: row.tipo,
    status: row.status,
    secoes: !!row.secoes,
    logicaCondicional: !!row.logica_condicional,
    anonimo: !!row.anonimo,
    slug: row.slug || null,
    eventoTipo: row.evento_tipo || null,
    eventoTipoOutro: row.evento_tipo_outro || null,
    eventoAtivo: row.evento_ativo == null ? true : !!row.evento_ativo,
    exigirIdentidade: row.exigir_identidade == null ? true : !!row.exigir_identidade,
    templateCodigo: row.template_codigo || 'wtorre',
    capaContainer: row.capa_container || null,
    capaBlob: row.capa_blob || null,
    capaNome: row.capa_nome || null,
    totalConvidados: row.total_convidados != null ? Number(row.total_convidados) : undefined,
    totalRespostas: row.total_respostas != null ? Number(row.total_respostas) : undefined,
    respondidoEm: toIso(row.respondido_em),
    criadoEm: toIso(row.criado_em),
    atualizadoEm: toIso(row.atualizado_em),
  };
}

function mapPergunta(row) {
  if (!row) return null;
  return {
    id: row.id,
    formularioId: row.formulario_id,
    ordem: Number(row.ordem),
    texto: row.texto,
    tipo: row.tipo,
    obrigatoria: !!row.obrigatoria,
    opcoes: Array.isArray(parseJson(row.opcoes, [])) ? parseJson(row.opcoes, []) : [],
    secaoTitulo: row.secao_titulo || null,
    logica: parseJson(row.logica, null),
  };
}

function mapRequisicao(row) {
  if (!row) return null;
  return {
    id: row.id,
    criadorId: row.criador_id,
    criadorNome: row.criador_nome || null,
    tipo: row.tipo,
    titulo: row.titulo,
    descricao: row.descricao || '',
    prioridade: row.prioridade,
    prazo: toDateStr(row.prazo),
    aprovadorUsuarioId: row.aprovador_usuario_id,
    aprovadorNome: row.aprovador_nome || null,
    aprovadorRotulo: row.aprovador_rotulo || null,
    observacoes: row.observacoes || '',
    anexoNome: row.anexo_nome || null,
    temAnexo: !!(row.anexo_container && row.anexo_blob),
    status: row.status,
    decididoEm: toIso(row.decidido_em),
    criadoEm: toIso(row.criado_em),
    atualizadoEm: toIso(row.atualizado_em),
  };
}

const FORM_SELECT = `
  SELECT f.*,
    DATE_FORMAT(f.prazo_inicio, '%Y%m%d%H%i') AS prazo_inicio_key,
    DATE_FORMAT(f.prazo_fim, '%Y%m%d%H%i') AS prazo_fim_key,
    u.nome_completo AS criador_nome,
    (SELECT COUNT(*) FROM pesquisas_respostas r WHERE r.formulario_id = f.id) AS total_respostas,
    (SELECT COUNT(*) FROM pesquisas_convidados c WHERE c.formulario_id = f.id) AS total_convidados
  FROM pesquisas_formularios f
  JOIN usuarios u ON u.id = f.criador_id
`;

const REQ_SELECT = `
  SELECT r.*,
    uc.nome_completo AS criador_nome,
    ua.nome_completo AS aprovador_nome
  FROM pesquisas_requisicoes r
  JOIN usuarios uc ON uc.id = r.criador_id
  LEFT JOIN usuarios ua ON ua.id = r.aprovador_usuario_id
`;

async function findFormularioById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(`${FORM_SELECT} WHERE f.id = ? LIMIT 1`, [id]);
  return mapFormulario(rows[0]);
}

async function listPerguntas(formularioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM pesquisas_perguntas WHERE formulario_id = ? ORDER BY ordem ASC, id ASC',
    [formularioId]
  );
  return rows.map(mapPergunta);
}

async function listFormulariosPendentes(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${FORM_SELECT}
     WHERE f.status = 'publicado'
       AND (f.evento_ativo IS NULL OR f.evento_ativo = 1)
       AND (f.prazo_inicio IS NULL OR f.prazo_inicio <= ?)
       AND (f.prazo_fim IS NULL OR f.prazo_fim >= ?)
       AND (
         f.publico_alvo = 'todos'
         OR (f.publico_alvo = 'departamento' AND f.publico_departamento = ?)
       )
       AND NOT EXISTS (
         SELECT 1 FROM pesquisas_respostas r
         WHERE r.formulario_id = f.id AND r.usuario_id = ?
       )
     ORDER BY f.prazo_fim IS NULL, f.prazo_fim ASC, f.criado_em DESC`,
    [nowSaoPauloSql(), nowSaoPauloSql(), user.departamento || '', user.id]
  );
  return rows.map(mapFormulario);
}

async function listFormulariosRespondidos(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT f.*,
       DATE_FORMAT(f.prazo_inicio, '%Y%m%d%H%i') AS prazo_inicio_key,
       DATE_FORMAT(f.prazo_fim, '%Y%m%d%H%i') AS prazo_fim_key,
       u.nome_completo AS criador_nome,
       (SELECT COUNT(*) FROM pesquisas_respostas r2 WHERE r2.formulario_id = f.id) AS total_respostas,
       r.enviado_em AS respondido_em
     FROM pesquisas_respostas r
     JOIN pesquisas_formularios f ON f.id = r.formulario_id
     JOIN usuarios u ON u.id = f.criador_id
     WHERE r.usuario_id = ?
     ORDER BY r.enviado_em DESC`,
    [userId]
  );
  return rows.map(mapFormulario);
}

async function listFormulariosCriados(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${FORM_SELECT} WHERE f.criador_id = ? ORDER BY f.atualizado_em DESC`,
    [userId]
  );
  return rows.map(mapFormulario);
}

async function listFormulariosAdmin() {
  const pool = getPool();
  const [rows] = await pool.execute(`${FORM_SELECT} ORDER BY f.atualizado_em DESC`);
  return rows.map(mapFormulario);
}

async function countFormulariosPendentes(user) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM pesquisas_formularios f
     WHERE f.status = 'publicado'
       AND (f.evento_ativo IS NULL OR f.evento_ativo = 1)
       AND (f.prazo_inicio IS NULL OR f.prazo_inicio <= ?)
       AND (f.prazo_fim IS NULL OR f.prazo_fim >= ?)
       AND (
         f.publico_alvo = 'todos'
         OR (f.publico_alvo = 'departamento' AND f.publico_departamento = ?)
       )
       AND NOT EXISTS (
         SELECT 1 FROM pesquisas_respostas r
         WHERE r.formulario_id = f.id AND r.usuario_id = ?
       )`,
    [nowSaoPauloSql(), nowSaoPauloSql(), user.departamento || '', user.id]
  );
  return Number(rows[0]?.n || 0);
}

async function countFormulariosRespondidos(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM pesquisas_respostas WHERE usuario_id = ?',
    [userId]
  );
  return Number(rows[0]?.n || 0);
}

async function countFormulariosCriados(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM pesquisas_formularios WHERE criador_id = ?',
    [userId]
  );
  return Number(rows[0]?.n || 0);
}

async function countFormulariosPorStatus(userId, status) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM pesquisas_formularios WHERE criador_id = ? AND status = ?',
    [userId, status]
  );
  return Number(rows[0]?.n || 0);
}

async function countRespostasRecebidas(criadorId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM pesquisas_respostas r
     INNER JOIN pesquisas_formularios f ON f.id = r.formulario_id
     WHERE f.criador_id = ?`,
    [criadorId]
  );
  return Number(rows[0]?.n || 0);
}

async function countUsuariosAtivos(departamento) {
  const pool = getPool();
  if (departamento) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS n FROM usuarios WHERE ativo = 1 AND departamento = ?',
      [departamento]
    );
    return Number(rows[0]?.n || 0);
  }
  const [rows] = await pool.execute('SELECT COUNT(*) AS n FROM usuarios WHERE ativo = 1');
  return Number(rows[0]?.n || 0);
}

async function listRespostaItens(respostaId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT i.pergunta_id, i.valor, p.texto, p.ordem
     FROM pesquisas_resposta_itens i
     INNER JOIN pesquisas_perguntas p ON p.id = i.pergunta_id
     WHERE i.resposta_id = ?
     ORDER BY p.ordem ASC, p.id ASC`,
    [respostaId]
  );
  return rows.map((row) => ({
    perguntaId: row.pergunta_id,
    valor: row.valor || '',
    texto: row.texto,
    ordem: Number(row.ordem),
  }));
}

async function seriesRespostasDiarias(formularioId, dias = 7) {
  const pool = getPool();
  const n = Math.min(Math.max(Number(dias) || 7, 1), 31);
  const [rows] = await pool.execute(
    `SELECT DATE(enviado_em) AS d, COUNT(*) AS n
     FROM pesquisas_respostas
     WHERE formulario_id = ? AND enviado_em >= DATE_SUB(CURDATE(), INTERVAL ${n - 1} DAY)
     GROUP BY DATE(enviado_em)`,
    [formularioId]
  );
  const byDay = new Map();
  for (const row of rows) {
    const key = toDateStr(row.d);
    if (key) byDay.set(key, Number(row.n || 0));
  }
  return { byDay, dias: n };
}

async function insertFormulario(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO pesquisas_formularios
      (criador_id, titulo, descricao, categoria, prazo, prazo_inicio, prazo_fim,
       publico_alvo, publico_departamento,
       tipo, status, secoes, logica_condicional, anonimo,
       slug, evento_tipo, evento_tipo_outro, evento_ativo, exigir_identidade, template_codigo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.criadorId,
      data.titulo,
      data.descricao || null,
      data.categoria,
      data.prazo || null,
      data.prazoInicio || null,
      data.prazoFim || null,
      data.publicoAlvo,
      data.publicoDepartamento || null,
      data.tipo,
      data.status,
      data.secoes ? 1 : 0,
      data.logicaCondicional ? 1 : 0,
      data.anonimo ? 1 : 0,
      data.slug || null,
      data.eventoTipo || null,
      data.eventoTipoOutro || null,
      data.eventoAtivo === false ? 0 : 1,
      data.exigirIdentidade === false ? 0 : 1,
      data.templateCodigo || 'wtorre',
    ]
  );
  return result.insertId;
}

async function updateFormularioMeta(id, data) {
  const pool = getPool();
  await pool.execute(
    `UPDATE pesquisas_formularios SET
       titulo = ?, descricao = ?, categoria = ?, prazo = ?, prazo_inicio = ?, prazo_fim = ?,
       publico_alvo = ?, publico_departamento = ?, tipo = ?, status = ?,
       secoes = ?, logica_condicional = ?, anonimo = ?,
       evento_tipo = ?, evento_tipo_outro = ?, evento_ativo = ?, exigir_identidade = ?,
       template_codigo = ?
     WHERE id = ?`,
    [
      data.titulo,
      data.descricao || null,
      data.categoria,
      data.prazo || null,
      data.prazoInicio || null,
      data.prazoFim || null,
      data.publicoAlvo,
      data.publicoDepartamento || null,
      data.tipo,
      data.status,
      data.secoes ? 1 : 0,
      data.logicaCondicional ? 1 : 0,
      data.anonimo ? 1 : 0,
      data.eventoTipo || null,
      data.eventoTipoOutro || null,
      data.eventoAtivo === false ? 0 : 1,
      data.exigirIdentidade === false ? 0 : 1,
      data.templateCodigo || 'wtorre',
      id,
    ]
  );
}

async function replacePerguntas(formularioId, perguntas) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM pesquisas_perguntas WHERE formulario_id = ?', [formularioId]);
    for (const p of perguntas) {
      await conn.execute(
        `INSERT INTO pesquisas_perguntas
          (formulario_id, ordem, texto, tipo, obrigatoria, opcoes, secao_titulo, logica)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          formularioId,
          p.ordem,
          p.texto,
          p.tipo,
          p.obrigatoria ? 1 : 0,
          p.opcoes ? JSON.stringify(p.opcoes) : null,
          p.secaoTitulo || null,
          p.logica ? JSON.stringify(p.logica) : null,
        ]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function setFormularioStatus(id, status) {
  const pool = getPool();
  await pool.execute('UPDATE pesquisas_formularios SET status = ? WHERE id = ?', [status, id]);
}

async function deleteFormulario(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM pesquisas_formularios WHERE id = ?', [id]);
}

async function findRespostaDoUsuario(formularioId, usuarioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT id, formulario_id, usuario_id, enviado_em FROM pesquisas_respostas WHERE formulario_id = ? AND usuario_id = ? LIMIT 1',
    [formularioId, usuarioId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    formularioId: row.formulario_id,
    usuarioId: row.usuario_id,
    enviadoEm: toIso(row.enviado_em),
  };
}

async function insertResposta(formularioId, usuarioId, itens, convidadoId = null) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO pesquisas_respostas (formulario_id, usuario_id, convidado_id) VALUES (?, ?, ?)',
      [formularioId, usuarioId || null, convidadoId || null]
    );
    const respostaId = result.insertId;
    for (const item of itens) {
      await conn.execute(
        'INSERT INTO pesquisas_resposta_itens (resposta_id, pergunta_id, valor) VALUES (?, ?, ?)',
        [respostaId, item.perguntaId, item.valor]
      );
    }
    await conn.commit();
    return respostaId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function listRespostasDetalhadas(formularioId) {
  const pool = getPool();
  const [respostas] = await pool.execute(
    `SELECT r.id, r.usuario_id, r.convidado_id, r.enviado_em,
       u.nome_completo, u.email, u.departamento,
       c.nome AS convidado_nome, c.email AS convidado_email, c.cpf_mascara
     FROM pesquisas_respostas r
     LEFT JOIN usuarios u ON u.id = r.usuario_id
     LEFT JOIN pesquisas_convidados c ON c.id = r.convidado_id
     WHERE r.formulario_id = ?
     ORDER BY r.enviado_em ASC`,
    [formularioId]
  );
  if (!respostas.length) return [];
  const ids = respostas.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const [itens] = await pool.execute(
    `SELECT resposta_id, pergunta_id, valor FROM pesquisas_resposta_itens
     WHERE resposta_id IN (${placeholders})`,
    ids
  );
  const byResposta = new Map();
  for (const r of respostas) {
    const isGuest = !!r.convidado_id;
    byResposta.set(r.id, {
      id: r.id,
      usuarioId: r.usuario_id,
      convidadoId: r.convidado_id,
      nome: isGuest ? r.convidado_nome || 'Convidado' : r.nome_completo,
      email: isGuest ? r.convidado_email : r.email,
      departamento: isGuest ? r.cpf_mascara || 'Externo' : r.departamento || '',
      enviadoEm: toIso(r.enviado_em),
      itens: [],
    });
  }
  for (const item of itens) {
    const rec = byResposta.get(item.resposta_id);
    if (rec) rec.itens.push({ perguntaId: item.pergunta_id, valor: item.valor });
  }
  return [...byResposta.values()];
}

async function findRequisicaoById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(`${REQ_SELECT} WHERE r.id = ? LIMIT 1`, [id]);
  return mapRequisicao(rows[0]);
}

async function findRequisicaoAnexo(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT anexo_container, anexo_blob, anexo_nome FROM pesquisas_requisicoes WHERE id = ? LIMIT 1',
    [id]
  );
  const row = rows[0];
  if (!row || !row.anexo_container || !row.anexo_blob) return null;
  return {
    container: row.anexo_container,
    blobName: row.anexo_blob,
    nome: row.anexo_nome,
  };
}

async function listRequisicoesPendentes(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${REQ_SELECT}
     WHERE r.aprovador_usuario_id = ?
       AND r.status IN ('pendente', 'em_andamento')
     ORDER BY r.criado_em DESC`,
    [userId]
  );
  return rows.map(mapRequisicao);
}

async function listRequisicoesRespondidas(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${REQ_SELECT}
     WHERE r.aprovador_usuario_id = ?
       AND r.status IN ('concluida', 'rejeitada')
     ORDER BY r.decidido_em DESC, r.atualizado_em DESC`,
    [userId]
  );
  return rows.map(mapRequisicao);
}

async function listRequisicoesCriadas(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${REQ_SELECT} WHERE r.criador_id = ? ORDER BY r.atualizado_em DESC`,
    [userId]
  );
  return rows.map(mapRequisicao);
}

async function listRequisicoesAdmin() {
  const pool = getPool();
  const [rows] = await pool.execute(`${REQ_SELECT} ORDER BY r.atualizado_em DESC`);
  return rows.map(mapRequisicao);
}

async function countRequisicoesPendentes(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM pesquisas_requisicoes
     WHERE aprovador_usuario_id = ? AND status IN ('pendente', 'em_andamento')`,
    [userId]
  );
  return Number(rows[0]?.n || 0);
}

async function countRequisicoesRespondidas(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM pesquisas_requisicoes
     WHERE aprovador_usuario_id = ? AND status IN ('concluida', 'rejeitada')`,
    [userId]
  );
  return Number(rows[0]?.n || 0);
}

async function countRequisicoesCriadas(userId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM pesquisas_requisicoes WHERE criador_id = ?',
    [userId]
  );
  return Number(rows[0]?.n || 0);
}

async function insertRequisicao(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO pesquisas_requisicoes
      (criador_id, tipo, titulo, descricao, prioridade, prazo,
       aprovador_usuario_id, aprovador_rotulo, observacoes,
       anexo_container, anexo_blob, anexo_nome, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.criadorId,
      data.tipo,
      data.titulo,
      data.descricao || null,
      data.prioridade,
      data.prazo || null,
      data.aprovadorUsuarioId,
      data.aprovadorRotulo || null,
      data.observacoes || null,
      data.anexoContainer || null,
      data.anexoBlob || null,
      data.anexoNome || null,
      data.status || 'pendente',
    ]
  );
  return result.insertId;
}

async function decidirRequisicao(id, status) {
  const pool = getPool();
  await pool.execute(
    'UPDATE pesquisas_requisicoes SET status = ?, decidido_em = NOW() WHERE id = ?',
    [status, id]
  );
}

async function deleteRequisicao(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM pesquisas_requisicoes WHERE id = ?', [id]);
}

async function buscarAprovadores(q) {
  const pool = getPool();
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT id, nome_completo, email, departamento
     FROM usuarios
     WHERE ativo = 1 AND (nome_completo LIKE ? OR email LIKE ?)
     ORDER BY nome_completo ASC
     LIMIT 20`,
    [like, like]
  );
  return rows.map((row) => ({
    id: row.id,
    nome: row.nome_completo,
    email: row.email,
    departamento: row.departamento || null,
  }));
}

async function listDepartamentos() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT DISTINCT departamento FROM usuarios
     WHERE departamento IS NOT NULL AND TRIM(departamento) != ''
     ORDER BY departamento ASC`
  );
  return rows.map((r) => r.departamento);
}

async function findFormularioBySlug(slug) {
  const pool = getPool();
  const [rows] = await pool.execute(`${FORM_SELECT} WHERE f.slug = ? LIMIT 1`, [slug]);
  return mapFormulario(rows[0]);
}

async function slugExists(slug, exceptId) {
  const pool = getPool();
  if (exceptId) {
    const [rows] = await pool.execute(
      'SELECT id FROM pesquisas_formularios WHERE slug = ? AND id != ? LIMIT 1',
      [slug, exceptId]
    );
    return !!rows[0];
  }
  const [rows] = await pool.execute(
    'SELECT id FROM pesquisas_formularios WHERE slug = ? LIMIT 1',
    [slug]
  );
  return !!rows[0];
}

async function setFormularioSlug(id, slug) {
  const pool = getPool();
  await pool.execute('UPDATE pesquisas_formularios SET slug = ? WHERE id = ? AND slug IS NULL', [
    slug,
    id,
  ]);
}

async function setEventoAtivo(id, ativo) {
  const pool = getPool();
  await pool.execute('UPDATE pesquisas_formularios SET evento_ativo = ? WHERE id = ?', [
    ativo ? 1 : 0,
    id,
  ]);
}

function mapConvidado(row) {
  if (!row) return null;
  return {
    id: row.id,
    formularioId: row.formulario_id,
    nome: row.nome || '',
    email: row.email,
    cpfMascara: row.cpf_mascara,
  };
}

async function listConvidados(formularioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, formulario_id, nome, email, cpf_mascara
     FROM pesquisas_convidados
     WHERE formulario_id = ?
     ORDER BY id ASC`,
    [formularioId]
  );
  return rows.map(mapConvidado);
}

async function countConvidados(formularioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM pesquisas_convidados WHERE formulario_id = ?',
    [formularioId]
  );
  return Number(rows[0]?.n || 0);
}

async function replaceConvidados(formularioId, convidados) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM pesquisas_convidados WHERE formulario_id = ?', [formularioId]);
    for (const g of convidados) {
      await conn.execute(
        `INSERT INTO pesquisas_convidados
          (formulario_id, nome, email, cpf_hash, cpf_mascara)
         VALUES (?, ?, ?, ?, ?)`,
        [formularioId, g.nome || null, g.email, g.cpfHash, g.cpfMascara]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function findConvidadoByHashEmail(formularioId, cpfHash, email) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, formulario_id, nome, email, cpf_mascara
     FROM pesquisas_convidados
     WHERE formulario_id = ? AND cpf_hash = ? AND LOWER(email) = ?
     LIMIT 1`,
    [formularioId, cpfHash, String(email || '').trim().toLowerCase()]
  );
  return mapConvidado(rows[0]);
}

async function findConvidadoHash(formularioId, id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, cpf_hash, cpf_mascara, nome, email
     FROM pesquisas_convidados
     WHERE formulario_id = ? AND id = ?
     LIMIT 1`,
    [formularioId, id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    cpfHash: row.cpf_hash,
    cpfMascara: row.cpf_mascara,
    nome: row.nome || '',
    email: row.email,
  };
}

async function findRespostaDoConvidado(formularioId, convidadoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, formulario_id, convidado_id, enviado_em
     FROM pesquisas_respostas
     WHERE formulario_id = ? AND convidado_id = ?
     LIMIT 1`,
    [formularioId, convidadoId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    formularioId: row.formulario_id,
    convidadoId: row.convidado_id,
    enviadoEm: toIso(row.enviado_em),
  };
}

module.exports = {
  findFormularioById,
  listPerguntas,
  listFormulariosPendentes,
  listFormulariosRespondidos,
  listFormulariosCriados,
  listFormulariosAdmin,
  countFormulariosPendentes,
  countFormulariosRespondidos,
  countFormulariosCriados,
  countFormulariosPorStatus,
  countRespostasRecebidas,
  countUsuariosAtivos,
  listRespostaItens,
  seriesRespostasDiarias,
  insertFormulario,
  updateFormularioMeta,
  replacePerguntas,
  setFormularioStatus,
  deleteFormulario,
  findRespostaDoUsuario,
  insertResposta,
  listRespostasDetalhadas,
  findRequisicaoById,
  findRequisicaoAnexo,
  listRequisicoesPendentes,
  listRequisicoesRespondidas,
  listRequisicoesCriadas,
  listRequisicoesAdmin,
  countRequisicoesPendentes,
  countRequisicoesRespondidas,
  countRequisicoesCriadas,
  insertRequisicao,
  decidirRequisicao,
  deleteRequisicao,
  buscarAprovadores,
  listDepartamentos,
  findFormularioBySlug,
  slugExists,
  setFormularioSlug,
  setEventoAtivo,
  listConvidados,
  countConvidados,
  replaceConvidados,
  findConvidadoByHashEmail,
  findConvidadoHash,
  findRespostaDoConvidado,
  setFormularioCapa,
  findFormularioCapa,
  mapTemplate,
  listTemplates,
  listTemplatesAtivos,
  findTemplateById,
  findTemplateByCodigo,
  insertTemplate,
  updateTemplate,
  deleteTemplate,
  countFormulariosPorTemplate,
};

function mapTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    wordmark: row.wordmark,
    corPrimaria: row.cor_primaria,
    corPrimariaEscura: row.cor_primaria_escura,
    raioPx: Number(row.raio_px) || 10,
    ativo: !!row.ativo,
    ordem: Number(row.ordem) || 0,
  };
}

async function setFormularioCapa(id, capa) {
  const pool = getPool();
  await pool.execute(
    `UPDATE pesquisas_formularios
     SET capa_container = ?, capa_blob = ?, capa_nome = ?
     WHERE id = ?`,
    [capa?.container || null, capa?.blob || null, capa?.nome || null, id]
  );
}

async function findFormularioCapa(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT capa_container, capa_blob, capa_nome FROM pesquisas_formularios WHERE id = ? LIMIT 1',
    [id]
  );
  const row = rows[0];
  if (!row || !row.capa_container || !row.capa_blob) return null;
  return { container: row.capa_container, blob: row.capa_blob, nome: row.capa_nome };
}

async function listTemplates() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM pesquisas_templates ORDER BY ordem ASC, nome ASC'
  );
  return rows.map(mapTemplate);
}

async function listTemplatesAtivos() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM pesquisas_templates WHERE ativo = 1 ORDER BY ordem ASC, nome ASC'
  );
  return rows.map(mapTemplate);
}

async function findTemplateById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM pesquisas_templates WHERE id = ? LIMIT 1', [id]);
  return mapTemplate(rows[0]);
}

async function findTemplateByCodigo(codigo) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM pesquisas_templates WHERE codigo = ? LIMIT 1',
    [codigo]
  );
  return mapTemplate(rows[0]);
}

async function insertTemplate(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO pesquisas_templates
      (codigo, nome, wordmark, cor_primaria, cor_primaria_escura, raio_px, ativo, ordem)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.codigo,
      data.nome,
      data.wordmark,
      data.corPrimaria,
      data.corPrimariaEscura,
      data.raioPx,
      data.ativo ? 1 : 0,
      data.ordem ?? 0,
    ]
  );
  return result.insertId;
}

async function updateTemplate(id, data) {
  const pool = getPool();
  await pool.execute(
    `UPDATE pesquisas_templates SET
       nome = ?, wordmark = ?, cor_primaria = ?, cor_primaria_escura = ?,
       raio_px = ?, ativo = ?, ordem = ?
     WHERE id = ?`,
    [
      data.nome,
      data.wordmark,
      data.corPrimaria,
      data.corPrimariaEscura,
      data.raioPx,
      data.ativo ? 1 : 0,
      data.ordem ?? 0,
      id,
    ]
  );
}

async function deleteTemplate(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM pesquisas_templates WHERE id = ?', [id]);
}

async function countFormulariosPorTemplate(codigo) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM pesquisas_formularios WHERE template_codigo = ?',
    [codigo]
  );
  return Number(rows[0]?.n || 0);
}
