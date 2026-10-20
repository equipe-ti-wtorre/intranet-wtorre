/**
 * Traduz o SQL do TaskHub (PostgreSQL) para o MySQL da intranet.
 * As tabelas recebem o prefixo th_ para não misturar com o restante.
 */

const TABLES = [
  'refresh_tokens',
  'workflow_statuses',
  'project_sections',
  'project_members',
  'task_comments',
  'task_activity',
  'day_plan_items',
  'directory_blocks',
  'day_closures',
  'routine_blocks',
  'routine_checks',
  'personal_notes',
  'sector_managers',
  'team_managers',
  'team_members',
  'access_profiles',
  'work_members',
  'work_visits',
  'work_schedule',
  'job_runs',
  'notifications',
  'categories',
  'subtasks',
  'projects',
  'sectors',
  'reminders',
  'tasks',
  'teams',
  'users',
];

const DATE_COLUMNS = new Set([
  'deadline', 'start_date', 'end_date', 'plan_date', 'due_date', 'away_until',
  'reminder_date', 'check_date', 'visited_at',
]);

const BOOL_COLUMNS = new Set([
  'active', 'is_director', 'must_change_password', 'archived', 'members_can_create',
  'is_private', 'migrated_v2', 'done', 'notified', 'pinned', 'system', 'show_to_manager',
]);

function prefixTables(sql) {
  let out = sql;
  for (const table of TABLES) {
    out = out.replace(new RegExp(`\\b${table}\\b`, 'g'), `th_${table}`);
  }
  return out;
}

function scanParen(sql, openAt) {
  let depth = 1;
  let j = openAt;
  while (j < sql.length && depth > 0) {
    if (sql[j] === '(') depth += 1;
    else if (sql[j] === ')') depth -= 1;
    j += 1;
  }
  return j;
}

// COUNT/SUM/AVG (...) FILTER (WHERE ...) não existe no MariaDB.
function replaceAggregateFilter(sql) {
  const re = /\b(COUNT|SUM|AVG)\s*\(/gi;
  let out = '';
  let i = 0;
  while (i < sql.length) {
    re.lastIndex = i;
    const m = re.exec(sql);
    if (!m) {
      out += sql.slice(i);
      break;
    }
    const argEnd = scanParen(sql, re.lastIndex);
    const arg = sql.slice(re.lastIndex, argEnd - 1);
    const filter = sql.slice(argEnd).match(/^\s*FILTER\s*\(\s*WHERE\s+/i);
    if (!filter) {
      out += sql.slice(i, argEnd);
      i = argEnd;
      continue;
    }
    const condStart = argEnd + filter[0].length;
    const condEnd = scanParen(sql, condStart);
    const cond = sql.slice(condStart, condEnd - 1);
    const fn = m[1].toUpperCase();
    let repl;
    if (fn === 'COUNT') {
      const when = arg.trim() === '*' ? cond : `(${cond}) AND ${arg} IS NOT NULL`;
      repl = `COALESCE(SUM(CASE WHEN ${when} THEN 1 ELSE 0 END), 0)`;
    } else if (fn === 'SUM') {
      repl = `SUM(CASE WHEN ${cond} THEN ${arg} END)`;
    } else {
      repl = `AVG(CASE WHEN ${cond} THEN ${arg} END)`;
    }
    out += sql.slice(i, m.index) + repl;
    i = condEnd;
  }
  return out;
}

function replaceAny(sql) {
  let out = sql.replace(
    /\$(\d+)\s*=\s*ANY\(\s*([\w.]+)\s*\)/gi,
    'JSON_CONTAINS($2, JSON_QUOTE($$$1))'
  );
  out = out.replace(
    /'([^']*)'\s*=\s*ANY\(\s*([\w.]+)\s*\)/gi,
    "JSON_CONTAINS($2, '\"$1\"')"
  );
  out = out.replace(
    /([\w.]+)\s*=\s*ANY\(\s*\$(\d+)\s*\)/gi,
    '(JSON_CONTAINS($$$2, JSON_QUOTE($1)) OR JSON_CONTAINS($$$2, CAST($1 AS CHAR)))'
  );
  out = out.replace(
    /([\w.]+)\s*=\s*ANY\(\s*([\w.]+)\s*\)/gi,
    'JSON_CONTAINS($2, JSON_QUOTE($1))'
  );
  return out;
}

function replaceNullsOrder(sql) {
  return sql
    .replace(/([\w.]+)\s+NULLS\s+LAST/gi, '($1 IS NULL), $1')
    .replace(/([\w.]+)\s+NULLS\s+FIRST/gi, '($1 IS NOT NULL), $1');
}

function replaceJsonAgg(sql) {
  return sql
    .replace(/\bjson_build_object\s*\(/gi, 'JSON_OBJECT(')
    .replace(/\bjson_agg\s*\(/gi, 'JSON_ARRAYAGG(');
}

function replaceConflict(sql) {
  let out = sql;
  if (/ON CONFLICT\s+DO NOTHING/i.test(out)) {
    out = out.replace(/ON CONFLICT\s+DO NOTHING/gi, '');
    out = out.replace(/INSERT INTO/i, 'INSERT IGNORE INTO');
  }
  out = out.replace(
    /ON CONFLICT\s*\([^)]*\)\s*DO UPDATE SET\s+/gi,
    'ON DUPLICATE KEY UPDATE '
  );
  out = out.replace(/EXCLUDED\.(\w+)/gi, 'VALUES($1)');
  return out;
}

function translate(sql, params = []) {
  let text = String(sql);
  text = prefixTables(text);
  text = text.replace(/\$(\d+)::date\b/gi, 'DATE($$$1)');
  text = text.replace(/(\b[\w.]+)::date\b/gi, 'DATE($1)');
  text = text.replace(/EXTRACT\s*\(\s*EPOCH\s+FROM\s+\(\s*([\w.]+)\s*-\s*([\w.]+)\s*\)\s*\)/gi, 'TIMESTAMPDIFF(SECOND, $2, $1)');
  text = text.replace(/::[a-z0-9_]+/gi, '');
  text = text.replace(/\bILIKE\b/gi, 'LIKE');
  text = text.replace(/\bIS NOT DISTINCT FROM\b/gi, '<=>');
  text = text.replace(
    /([\w.]+)\s+IS\s+DISTINCT\s+FROM\s+([\w.$]+)/gi,
    'NOT ($1 <=> $2)'
  );
  text = text.replace(
    /INTERVAL\s+'(\d+)\s+days?'/gi,
    'INTERVAL $1 DAY'
  );
  text = text.replace(/\bNOW\(\)\s*-\s*INTERVAL\s+(\d+)\s+DAY/gi, 'DATE_SUB(NOW(), INTERVAL $1 DAY)');
  text = text.replace(/\bNOW\(\)\s*\+\s*INTERVAL\s+(\d+)\s+DAY/gi, 'DATE_ADD(NOW(), INTERVAL $1 DAY)');
  text = replaceNullsOrder(text);
  text = replaceJsonAgg(text);
  text = replaceAggregateFilter(text);
  text = replaceAny(text);
  text = text.replace(/\btrue\b/g, '1');
  text = text.replace(/\bfalse\b/g, '0');
  text = text.replace(/\brepeat\b/g, '`repeat_kind`');
  text = text.replace(/\bkey\b/g, '`key`');
  text = replaceConflict(text);

  let returning = null;
  const ret = text.match(/\s+RETURNING\s+(.+)\s*$/i);
  if (ret) {
    returning = '*';
    text = text.replace(/\s+RETURNING\s+.+\s*$/i, '');
  }

  const order = [];
  text = text.replace(/\$(\d+)/g, (_, n) => {
    order.push(Number(n) - 1);
    return '?';
  });

  const mapped = order.map((i) => normalizeParam(params[i]));
  const insert = text.match(/\bINSERT(?:\s+IGNORE)?\s+INTO\s+(`?th_\w+`?)/i);
  const update = text.match(/\bUPDATE\s+(`?th_\w+`?)/i);
  const del = text.match(/\bDELETE\s+FROM\s+(`?th_\w+`?)/i);

  return {
    sql: text,
    params: mapped,
    returning,
    table: (insert || update || del)?.[1] || null,
    kind: insert ? 'insert' : update ? 'update' : del ? 'delete' : 'select',
  };
}

function normalizeParam(value) {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const logical = key === 'repeat_kind' ? 'repeat' : key;
    if (BOOL_COLUMNS.has(key)) {
      out[logical] = value == null ? value : value === 1 || value === true;
    } else if (DATE_COLUMNS.has(key)) {
      out[logical] = formatDate(value);
    } else if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
      try { out[logical] = JSON.parse(value); } catch { out[logical] = value; }
    } else if (Buffer.isBuffer(value)) {
      out[logical] = value.toString('utf8');
    } else {
      out[logical] = value;
    }
  }
  return out;
}

module.exports = { translate, normalizeRow, normalizeParam };
