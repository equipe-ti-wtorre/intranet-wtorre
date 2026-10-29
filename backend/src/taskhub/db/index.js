const { getPool } = require('../../db/pool');
const { translate, normalizeRow } = require('./sql');

function extractWhere(sql, params) {
  const idx = sql.search(/\bWHERE\b/i);
  if (idx < 0) return null;
  const before = sql.slice(0, idx);
  const clause = sql.slice(idx + 5).trim().replace(/;+\s*$/, '');
  const beforeCount = (before.match(/\?/g) || []).length;
  return { clause, params: params.slice(beforeCount) };
}

async function queryOn(conn, sql, params) {
  const plan = translate(sql, params || []);
  const [result] = await conn.query(plan.sql, plan.params);

  if (Array.isArray(result)) {
    return { rows: result.map(normalizeRow), rowCount: result.length };
  }

  const header = result;
  if (plan.returning && plan.kind === 'insert' && plan.table && header.insertId) {
    const [rows] = await conn.query(`SELECT * FROM ${plan.table} WHERE id = ?`, [header.insertId]);
    return { rows: rows.map(normalizeRow), rowCount: header.affectedRows };
  }

  if (plan.returning && plan.kind === 'update' && plan.table) {
    const where = extractWhere(plan.sql, plan.params);
    if (where) {
      const [rows] = await conn.query(
        `SELECT * FROM ${plan.table} WHERE ${where.clause}`,
        where.params
      );
      return { rows: rows.map(normalizeRow), rowCount: header.affectedRows };
    }
  }

  if (plan.returning && plan.kind === 'delete') {
    return {
      rows: header.affectedRows ? [{ id: header.affectedRows }] : [],
      rowCount: header.affectedRows,
    };
  }

  return { rows: [], rowCount: header.affectedRows || 0 };
}

function query(sql, params) {
  return queryOn(getPool(), sql, params);
}

async function tx(fn) {
  const conn = await getPool().getConnection();
  const client = { query: (sql, params) => queryOn(conn, sql, params) };
  try {
    await conn.beginTransaction();
    const result = await fn(client);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { query, tx };
