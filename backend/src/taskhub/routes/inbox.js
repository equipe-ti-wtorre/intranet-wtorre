const router = require('express').Router();
const { query } = require('../db');
const { ah, intParam, HttpError } = require('../lib/http');

const VISIBLE = `n.user_id = $1 AND n.archived_at IS NULL AND (n.snoozed_until IS NULL OR n.snoozed_until <= NOW())`;

router.get('/', ah(async (req, res) => {
  const unreadOnly = req.query.filter === 'unread';
  const { rows } = await query(
    `SELECT n.*, a.name AS actor_name, a.initials AS actor_initials, a.color AS actor_color,
            t.title AS task_title, p.name AS project_name
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
       LEFT JOIN tasks t ON t.id = n.task_id
       LEFT JOIN projects p ON p.id = n.project_id
      WHERE ${VISIBLE} ${unreadOnly ? 'AND n.read_at IS NULL' : ''}
      ORDER BY n.created_at DESC LIMIT 200`,
    [req.user.id]
  );
  res.json(rows);
}));

router.get('/count', ah(async (req, res) => {
  const { rows } = await query(`SELECT COUNT(*) AS n FROM notifications n WHERE ${VISIBLE} AND n.read_at IS NULL`, [req.user.id]);
  res.json({ unread: rows[0].n });
}));

router.post('/read-all', ah(async (req, res) => {
  await query(`UPDATE notifications n SET read_at = NOW() WHERE ${VISIBLE} AND n.read_at IS NULL`, [req.user.id]);
  res.json({ ok: true });
}));

async function update(req, sql, params = []) {
  const { rowCount } = await query(
    `UPDATE notifications SET ${sql} WHERE id = $1 AND user_id = $2`,
    [intParam(req.params.id), req.user.id, ...params]
  );
  if (!rowCount) throw new HttpError(404, 'Notificação não encontrada');
}

router.post('/:id/read', ah(async (req, res) => { await update(req, 'read_at = COALESCE(read_at, NOW())'); res.json({ ok: true }); }));
router.post('/:id/unread', ah(async (req, res) => { await update(req, 'read_at = NULL'); res.json({ ok: true }); }));
router.post('/:id/archive', ah(async (req, res) => { await update(req, 'archived_at = NOW(), read_at = COALESCE(read_at, NOW())'); res.json({ ok: true }); }));
router.post('/:id/snooze', ah(async (req, res) => {
  const until = new Date(req.body?.until);
  if (Number.isNaN(until.getTime()) || until <= new Date()) throw new HttpError(400, 'Escolha uma data futura.');
  await update(req, 'snoozed_until = $3, read_at = NULL', [until]);
  res.json({ ok: true });
}));

module.exports = router;
