const crypto = require('crypto');
const { getPool } = require('../db/pool');

const EVENTO_COLS = `e.id, e.codigo, DATE_FORMAT(e.data, '%Y-%m-%d') AS data, e.titulo, e.texto, e.categoria,
            e.localizacao, e.estado, e.duracao_slot_min, e.oculto_lista, e.link_publico, e.imagem,
            e.imagem_zoom, e.imagem_tamanho, e.imagem_altura, e.imagem_pos_x, e.imagem_pos_y, e.texto_tamanho, e.texto_alinhamento,
            e.texto_estilos,
            e.criado_em, e.atualizado_em`;

function httpError(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

function gerarCodigoEvento() {
  return crypto.randomBytes(12).toString('hex');
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapAlinhamento(value) {
  return value === 'centro' || value === 'direita' ? value : 'esquerda';
}

function parseTextoEstilos(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapEvento(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo,
    data: row.data,
    titulo: row.titulo,
    texto: row.texto || '',
    categoria: row.categoria || '',
    localizacao: row.localizacao || '',
    estado: row.estado,
    duracao_slot_min: Number(row.duracao_slot_min) || 60,
    oculto_lista: !!row.oculto_lista,
    link_publico: !!row.link_publico,
    tem_imagem: !!row.imagem,
    imagem_zoom: numOr(row.imagem_zoom, 100),
    imagem_tamanho: numOr(row.imagem_tamanho, 100),
    imagem_altura: numOr(row.imagem_altura, 0),
    imagem_pos_x: numOr(row.imagem_pos_x, 50),
    imagem_pos_y: numOr(row.imagem_pos_y, 50),
    texto_tamanho: numOr(row.texto_tamanho, 32),
    texto_alinhamento: mapAlinhamento(row.texto_alinhamento),
    texto_estilos: parseTextoEstilos(row.texto_estilos),
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    inscritos: row.inscritos != null ? Number(row.inscritos) : undefined,
    visualizadores_count:
      row.visualizadores_count != null ? Number(row.visualizadores_count) : undefined,
    ...extras,
  };
}

function mapSlot(row) {
  return {
    id: row.id,
    evento_id: row.evento_id,
    horario: row.horario,
    vagas: Number(row.vagas) || 0,
    inscritos: Number(row.inscritos) || 0,
    vagas_restantes: Math.max(0, (Number(row.vagas) || 0) - (Number(row.inscritos) || 0)),
  };
}

function mapVisualizador(row) {
  return {
    usuario_id: row.usuario_id,
    colaborador_id: row.colaborador_id,
    nome_completo: row.colaborador_nome || row.nome_completo,
    email: row.colaborador_email || row.email,
    departamento: row.departamento || null,
  };
}

function mapInscricao(row) {
  return {
    id: row.id,
    slot_id: row.slot_id,
    evento_id: row.evento_id,
    usuario_id: row.usuario_id,
    nome_completo: row.nome_completo,
    email: row.email,
    cpf: row.cpf,
    horario: row.horario,
    criado_em: row.criado_em,
  };
}

async function listarPublicos({ usuarioId, microsoftId, isAdmin }) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ${EVENTO_COLS}
     FROM cipa_eventos e
     WHERE e.estado = 'aberto'
       AND (e.oculto_lista = 0 OR ? = 1)
       AND (
         ? = 1
         OR e.link_publico = 1
         OR EXISTS (
           SELECT 1
           FROM cipa_evento_visualizadores v
           LEFT JOIN colaboradores c ON c.id = v.colaborador_id
           WHERE v.evento_id = e.id
             AND (v.usuario_id = ? OR (? <> '' AND c.ad_id = ?))
         )
       )
     ORDER BY e.data ASC, e.id ASC`,
    [isAdmin ? 1 : 0, isAdmin ? 1 : 0, usuarioId, microsoftId || '', microsoftId || '']
  );
  return rows.map((r) => mapEvento(r));
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ${EVENTO_COLS}
     FROM cipa_eventos e
     WHERE e.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByCodigo(codigo) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ${EVENTO_COLS}
     FROM cipa_eventos e
     WHERE e.codigo = ?
     LIMIT 1`,
    [String(codigo || '').toLowerCase()]
  );
  return rows[0] || null;
}

async function listarAdmin() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ${EVENTO_COLS},
            (SELECT COUNT(*) FROM cipa_evento_slots s
              JOIN cipa_inscricoes i ON i.slot_id = s.id
              WHERE s.evento_id = e.id) AS inscritos,
            (SELECT COUNT(*) FROM cipa_evento_visualizadores v WHERE v.evento_id = e.id) AS visualizadores_count
     FROM cipa_eventos e
     ORDER BY e.data DESC, e.id DESC`
  );
  return rows.map((r) => mapEvento(r));
}

async function listarSlots(eventoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT s.id, s.evento_id, TIME_FORMAT(s.horario, '%H:%i') AS horario, s.vagas,
            (SELECT COUNT(*) FROM cipa_inscricoes i WHERE i.slot_id = s.id) AS inscritos
     FROM cipa_evento_slots s
     WHERE s.evento_id = ?
     ORDER BY s.horario ASC`,
    [eventoId]
  );
  return rows.map(mapSlot);
}

async function listarVisualizadores(eventoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT v.usuario_id, v.colaborador_id, u.nome_completo, u.email,
            c.nome AS colaborador_nome, c.email AS colaborador_email, c.departamento
     FROM cipa_evento_visualizadores v
     JOIN usuarios u ON u.id = v.usuario_id
     LEFT JOIN colaboradores c ON c.id = v.colaborador_id
     WHERE v.evento_id = ?
     ORDER BY COALESCE(c.nome, u.nome_completo) ASC`,
    [eventoId]
  );
  return rows.map(mapVisualizador);
}

async function usuarioPodeVer(eventoId, { usuarioId, microsoftId, isAdmin }) {
  if (isAdmin) return true;
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT 1
     FROM cipa_evento_visualizadores v
     LEFT JOIN colaboradores c ON c.id = v.colaborador_id
     WHERE v.evento_id = ?
       AND (v.usuario_id = ? OR (? <> '' AND c.ad_id = ?))
     LIMIT 1`,
    [eventoId, usuarioId, microsoftId || '', microsoftId || '']
  );
  return rows.length > 0;
}

async function criarEvento(conn, data) {
  const codigo = data.codigo || gerarCodigoEvento();
  const [result] = await conn.execute(
    `INSERT INTO cipa_eventos
       (codigo, data, titulo, texto, imagem, imagem_zoom, imagem_tamanho, imagem_altura, imagem_pos_x, imagem_pos_y, texto_tamanho, texto_alinhamento,
        texto_estilos, categoria, localizacao, estado, duracao_slot_min, oculto_lista, link_publico)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      codigo,
      data.data,
      data.titulo,
      data.texto || null,
      data.imagem || null,
      data.imagem_zoom,
      data.imagem_tamanho,
      data.imagem_altura,
      data.imagem_pos_x,
      data.imagem_pos_y,
      data.texto_tamanho,
      data.texto_alinhamento,
      data.texto_estilos,
      data.categoria || null,
      data.localizacao || null,
      data.estado || 'aberto',
      data.duracao_slot_min || 60,
      data.oculto_lista ? 1 : 0,
      data.link_publico ? 1 : 0,
    ]
  );
  return result.insertId;
}

async function atualizarEvento(conn, id, data) {
  await conn.execute(
    `UPDATE cipa_eventos
     SET data = ?, titulo = ?, texto = ?, imagem = ?, imagem_zoom = ?, imagem_tamanho = ?, imagem_altura = ?, imagem_pos_x = ?, imagem_pos_y = ?,
         texto_tamanho = ?, texto_alinhamento = ?, texto_estilos = ?, categoria = ?, localizacao = ?,
         estado = ?, duracao_slot_min = ?, oculto_lista = ?, link_publico = ?
     WHERE id = ?`,
    [
      data.data,
      data.titulo,
      data.texto || null,
      data.imagem,
      data.imagem_zoom,
      data.imagem_tamanho,
      data.imagem_altura,
      data.imagem_pos_x,
      data.imagem_pos_y,
      data.texto_tamanho,
      data.texto_alinhamento,
      data.texto_estilos,
      data.categoria || null,
      data.localizacao || null,
      data.estado || 'aberto',
      data.duracao_slot_min || 60,
      data.oculto_lista ? 1 : 0,
      data.link_publico ? 1 : 0,
      id,
    ]
  );
}

async function excluirEvento(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM cipa_eventos WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function substituirSlots(conn, eventoId, slots) {
  const horarios = slots.map((s) => s.horario);
  if (horarios.length) {
    const placeholders = horarios.map(() => '?').join(',');
    await conn.execute(
      `DELETE FROM cipa_evento_slots WHERE evento_id = ? AND TIME_FORMAT(horario, '%H:%i') NOT IN (${placeholders})`,
      [eventoId, ...horarios]
    );
  } else {
    await conn.execute('DELETE FROM cipa_evento_slots WHERE evento_id = ?', [eventoId]);
  }

  for (const slot of slots) {
    await conn.execute(
      `INSERT INTO cipa_evento_slots (evento_id, horario, vagas)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE vagas = VALUES(vagas)`,
      [eventoId, `${slot.horario}:00`, slot.vagas]
    );
  }
}

async function substituirVisualizadores(conn, eventoId, itens) {
  await conn.execute('DELETE FROM cipa_evento_visualizadores WHERE evento_id = ?', [eventoId]);
  for (const item of itens) {
    await conn.execute(
      `INSERT INTO cipa_evento_visualizadores (evento_id, usuario_id, colaborador_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE colaborador_id = VALUES(colaborador_id)`,
      [eventoId, item.usuario_id, item.colaborador_id || null]
    );
  }
}

async function lockSlot(conn, slotId) {
  const [rows] = await conn.execute(
    `SELECT s.id, s.evento_id, TIME_FORMAT(s.horario, '%H:%i') AS horario, s.vagas,
            (SELECT COUNT(*) FROM cipa_inscricoes i WHERE i.slot_id = s.id) AS inscritos
     FROM cipa_evento_slots s
     WHERE s.id = ?
     FOR UPDATE`,
    [slotId]
  );
  return rows[0] ? mapSlot(rows[0]) : null;
}

async function cpfJaInscritoNoEvento(conn, eventoId, cpf) {
  const [rows] = await conn.execute(
    `SELECT i.id
     FROM cipa_inscricoes i
     JOIN cipa_evento_slots s ON s.id = i.slot_id
     WHERE s.evento_id = ? AND i.cpf = ?
     LIMIT 1
     FOR UPDATE`,
    [eventoId, cpf]
  );
  return rows.length > 0;
}

async function inserirInscricao(conn, data) {
  const [result] = await conn.execute(
    `INSERT INTO cipa_inscricoes (slot_id, usuario_id, nome_completo, email, cpf)
     VALUES (?, ?, ?, ?, ?)`,
    [data.slot_id, data.usuario_id || null, data.nome_completo, data.email, data.cpf]
  );
  return result.insertId;
}

async function listarInscritos(eventoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT i.id, i.slot_id, s.evento_id, i.usuario_id, i.nome_completo, i.email, i.cpf,
            TIME_FORMAT(s.horario, '%H:%i') AS horario, i.criado_em
     FROM cipa_inscricoes i
     JOIN cipa_evento_slots s ON s.id = i.slot_id
     WHERE s.evento_id = ?
     ORDER BY s.horario ASC, i.nome_completo ASC`,
    [eventoId]
  );
  return rows.map(mapInscricao);
}

async function excluirInscricao(eventoId, inscricaoId) {
  const pool = getPool();
  const [result] = await pool.execute(
    `DELETE i FROM cipa_inscricoes i
     JOIN cipa_evento_slots s ON s.id = i.slot_id
     WHERE i.id = ? AND s.evento_id = ?`,
    [inscricaoId, eventoId]
  );
  return result.affectedRows > 0;
}

async function findInscricaoNoEvento(eventoId, inscricaoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT i.id, i.slot_id, s.evento_id, i.usuario_id, i.nome_completo, i.email, i.cpf,
            TIME_FORMAT(s.horario, '%H:%i') AS horario, i.criado_em
     FROM cipa_inscricoes i
     JOIN cipa_evento_slots s ON s.id = i.slot_id
     WHERE i.id = ? AND s.evento_id = ?
     LIMIT 1`,
    [inscricaoId, eventoId]
  );
  return rows[0] ? mapInscricao(rows[0]) : null;
}

module.exports = {
  httpError,
  mapEvento,
  gerarCodigoEvento,
  listarPublicos,
  findById,
  findByCodigo,
  listarAdmin,
  listarSlots,
  listarVisualizadores,
  usuarioPodeVer,
  criarEvento,
  atualizarEvento,
  excluirEvento,
  substituirSlots,
  substituirVisualizadores,
  lockSlot,
  cpfJaInscritoNoEvento,
  inserirInscricao,
  listarInscritos,
  excluirInscricao,
  findInscricaoNoEvento,
};
