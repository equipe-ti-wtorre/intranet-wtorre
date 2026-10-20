const router = require('express').Router();
const { query } = require('../db');
const { ah } = require('../lib/http');
const { TASK_SELECT, formatTask } = require('../lib/tasks');

router.get('/', ah(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ tasks: [], projects: [], people: [] });
  const like = `%${q}%`;
  const [tasks, projects, people] = await Promise.all([
    query(`${TASK_SELECT} WHERE th_task_access($1, t.id) IS NOT NULL AND (t.title ILIKE $2 OR t.notes ILIKE $2)
           ORDER BY (t.title ILIKE $2) DESC, t.updated_at DESC LIMIT 8`, [req.user.id, like]),
    query(`SELECT p.id, p.name, p.color, t.name AS team_name FROM projects p JOIN teams t ON t.id = p.team_id
            WHERE p.archived = false AND p.name ILIKE $2 AND th_project_role($1, p.id) IS NOT NULL
            ORDER BY p.name LIMIT 5`, [req.user.id, like]),
    query(`SELECT id, name, username, initials, color, job_title FROM users
            WHERE active IS DISTINCT FROM false AND (name ILIKE $1 OR username ILIKE $1) ORDER BY name LIMIT 5`, [like]),
  ]);
  res.json({ tasks: tasks.rows.map(formatTask), projects: projects.rows, people: people.rows });
}));

module.exports = router;
