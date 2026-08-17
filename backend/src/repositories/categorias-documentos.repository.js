const { getPool } = require('../db/pool');

function mapCategoria(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    descricao: row.descricao,
    icone: row.icone,
    parent_id: row.parent_id,
    pagina_id: row.pagina_id,
    ordem: row.ordem,
    ativo: !!row.ativo,
    documentos_count: row.documentos_count != null ? Number(row.documentos_count) : undefined,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function sumDescendantCounts(node) {
  let total = node.documentos_count ?? 0;
  for (const child of node.children || []) {
    total += sumDescendantCounts(child);
  }
  return total;
}

function buildTree(rows, options = {}) {
  const { filterActive = false, includeAdminFields = false, includeRootCounts = false } = options;
  const filtered = rows.filter((row) => !(filterActive && !row.ativo));

  const byId = new Map();
  for (const row of filtered) {
    byId.set(row.id, { ...mapCategoria(row), children: [] });
  }

  const roots = [];
  for (const node of byId.values()) {
    if (node.parent_id != null && byId.has(node.parent_id)) {
      byId.get(node.parent_id).children.push(node);
    } else if (node.parent_id == null) {
      roots.push(node);
    }
  }

  const sortChildren = (items) => {
    items.sort((a, b) => a.ordem - b.ordem);
    for (const item of items) {
      sortChildren(item.children);
    }
  };
  sortChildren(roots);

  const formatNodes = (items, isRootLevel = false) =>
    items.map(({ parent_id, pagina_id, ativo, children, documentos_count, ...rest }) => {
      const childNodes = formatNodes(children || [], false);
      const node = { ...rest, children: childNodes };
      if (includeAdminFields) {
        node.ativo = ativo;
        node.parent_id = parent_id;
        node.pagina_id = pagina_id;
        if (documentos_count != null) node.documentos_count = documentos_count;
      } else if (includeRootCounts && isRootLevel) {
        const withChildren = { ...node, documentos_count: documentos_count ?? 0, children: childNodes };
        node.documentos_count = sumDescendantCounts(withChildren);
      }
      return node;
    });

  return formatNodes(roots, true);
}

async function findAllFlat({ includeCounts = false, paginaId = null } = {}) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (paginaId != null) {
    conditions.push('c.pagina_id = ?');
    params.push(paginaId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = includeCounts
    ? `SELECT c.*, (
         (SELECT COUNT(DISTINCT d.id) FROM documentos d
            INNER JOIN documento_entidades de ON de.documento_id = d.id
            WHERE de.categoria_id = c.id AND d.ativo = 1)
         +
         (SELECT COUNT(DISTINCT t.id) FROM treinamentos t
            INNER JOIN treinamento_entidades te ON te.treinamento_id = t.id
            WHERE te.categoria_id = c.id AND t.ativo = 1)
       ) AS documentos_count
       FROM categorias_documentos c ${where}
       ORDER BY c.parent_id IS NULL DESC, c.parent_id, c.ordem, c.id`
    : `SELECT * FROM categorias_documentos c ${where}
       ORDER BY c.parent_id IS NULL DESC, c.parent_id, c.ordem, c.id`;

  const [rows] = await pool.execute(sql, params);
  return rows.map(mapCategoria);
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM categorias_documentos WHERE id = ? LIMIT 1', [id]);
  return mapCategoria(rows[0]);
}

async function findBySlug(slug, paginaId = null) {
  const pool = getPool();
  if (paginaId != null) {
    const [rows] = await pool.execute(
      'SELECT * FROM categorias_documentos WHERE slug = ? AND pagina_id = ? LIMIT 1',
      [slug, paginaId]
    );
    return mapCategoria(rows[0]);
  }
  const [rows] = await pool.execute(
    'SELECT * FROM categorias_documentos WHERE slug = ? LIMIT 1',
    [slug]
  );
  return mapCategoria(rows[0]);
}

/** @deprecated Legado — redirect de URLs antigas; tiebreak por menor id. */
async function findAllBySlugLegacy(slug) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM categorias_documentos WHERE slug = ? ORDER BY id ASC',
    [slug]
  );
  return rows.map(mapCategoria);
}

async function collectSubtreeIds(rootId) {
  const all = await findAllFlat();
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of all) {
      if (row.parent_id != null && ids.has(row.parent_id) && !ids.has(row.id)) {
        ids.add(row.id);
        changed = true;
      }
    }
  }
  return [...ids];
}

async function findArquivoPathsByCategoriaSubtree(categoriaId) {
  const ids = await collectSubtreeIds(categoriaId);
  if (!ids.length) return [];
  const pool = getPool();
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT arquivo_path FROM documentos WHERE categoria_id IN (${placeholders})`,
    ids
  );
  return rows.map((r) => r.arquivo_path);
}

async function findArquivoPathsByPaginaId(paginaId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT d.arquivo_path FROM documentos d
     INNER JOIN categorias_documentos c ON d.categoria_id = c.id
     WHERE c.pagina_id = ?`,
    [paginaId]
  );
  return rows.map((r) => r.arquivo_path);
}

async function create(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO categorias_documentos (nome, slug, descricao, icone, parent_id, pagina_id, ordem, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.nome,
      data.slug,
      data.descricao ?? null,
      data.icone ?? null,
      data.parent_id ?? null,
      data.pagina_id,
      data.ordem ?? 0,
      data.ativo !== false ? 1 : 0,
    ]
  );
  return findById(result.insertId);
}

async function update(id, data) {
  const pool = getPool();
  const fields = [];
  const values = [];
  const allowed = ['nome', 'slug', 'descricao', 'icone', 'parent_id', 'pagina_id', 'ordem', 'ativo'];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      if (key === 'ativo') {
        values.push(data[key] ? 1 : 0);
      } else if (key === 'parent_id' && (data[key] === '' || data[key] == null)) {
        values.push(null);
      } else {
        values.push(data[key]);
      }
    }
  }

  if (fields.length) {
    values.push(id);
    await pool.execute(`UPDATE categorias_documentos SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  return findById(id);
}

async function remove(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM categorias_documentos WHERE id = ?', [id]);
}

async function reorderBatch(items) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of items) {
      await conn.execute('UPDATE categorias_documentos SET parent_id = ?, ordem = ? WHERE id = ?', [
        item.parent_id ?? null,
        item.ordem,
        item.id,
      ]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function isDescendant(ancestorId, nodeId) {
  let current = await findById(nodeId);
  while (current?.parent_id) {
    if (current.parent_id === ancestorId) return true;
    current = await findById(current.parent_id);
  }
  return false;
}

module.exports = {
  findAllFlat,
  findById,
  findBySlug,
  findAllBySlugLegacy,
  findArquivoPathsByCategoriaSubtree,
  findArquivoPathsByPaginaId,
  create,
  update,
  remove,
  reorderBatch,
  buildTree,
  mapCategoria,
  isDescendant,
  collectSubtreeIds,
};
