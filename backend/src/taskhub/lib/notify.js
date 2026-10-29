const { query } = require('../db');

// Cria uma notificação na Caixa de entrada. Nunca notifica a própria pessoa.
async function notify(run, { userId, actorId, type, taskId = null, projectId = null, title, body = '' }) {
  if (!userId || userId === actorId) return;
  const exec = run || { query };
  await exec.query(
    `INSERT INTO notifications (user_id, actor_id, type, task_id, project_id, title, body)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, actorId || null, type, taskId, projectId, String(title).slice(0, 300), body]
  );
}

// Extrai @usuario de um texto e devolve os ids dos usuários ativos citados.
async function mentionedUserIds(run, text) {
  const names = [...new Set((String(text).match(/@([a-z0-9._-]+)/gi) || []).map(m => m.slice(1).toLowerCase()))];
  if (!names.length) return [];
  const exec = run || { query };
  const { rows } = await exec.query(
    `SELECT id FROM users WHERE LOWER(username) = ANY($1) AND active IS DISTINCT FROM false`,
    [names]
  );
  return rows.map(r => r.id);
}

module.exports = { notify, mentionedUserIds };
