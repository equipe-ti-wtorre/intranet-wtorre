const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { has } = require('../lib/permissions');
const { teamPhases } = require('../lib/phases');
const { clampPhaseDays } = require('../lib/timeline');
const { oversees, overseesSector } = require('./teams');

// Fases da equipe: colunas do Kanban de projetos e de tarefas de tudo o que é da equipe.

const TEAM_WORKS = `SELECT s.id FROM project_sections s JOIN projects p ON p.id = s.project_id WHERE p.team_id = $1`;
const TEAM_TASKS = `SELECT tk.id FROM tasks tk JOIN projects p ON p.id = tk.project_id WHERE p.team_id = $1`;

async function loadTeam(id) {
  const { rows: [t] } = await query('SELECT id, sector_id FROM teams WHERE id = $1', [id]);
  if (!t) throw new HttpError(404, 'Equipe não encontrada');
  return t;
}

// Quem monta as fases: gestão da equipe, quem acompanha o setor e o administrador.
async function canEdit(user, teamId) {
  if (!teamId) return false;
  if (has(user, 'gerenciar_pessoas_todas')) return true;
  if (await oversees(user, teamId)) return true;
  const { rows: [t] } = await query('SELECT sector_id FROM teams WHERE id = $1', [teamId]);
  return !!(t?.sector_id && await overseesSector(user, t.sector_id));
}

async function canSee(user, teamId) {
  if (await canEdit(user, teamId)) return true;
  const { rows: [r] } = await query(
    `SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2) AS ok`, [teamId, user.id]
  );
  return !!r.ok;
}

router.get('/teams/:id/phases', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await loadTeam(id);
  if (!(await canSee(req.user, id))) throw new HttpError(404, 'Equipe não encontrada');
  const phases = await teamPhases({ query }, id);
  res.json({ phases, is_default: phases.every(p => p.team_id == null), can_edit: await canEdit(req.user, id) });
}));

const saveSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(2, 'informe o nome da fase').max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b93a1'),
    duration_days: z.coerce.number().int().min(0).max(365).optional(),
  })).min(1, 'mantenha pelo menos uma fase').max(20),
});

// Salva a lista inteira, na ordem enviada. Na primeira vez, a equipe ganha uma cópia própria da
// lista padrão e o que estava na padrão passa para a cópia.
router.put('/teams/:id/phases', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await loadTeam(id);
  if (!(await canEdit(req.user, id))) throw new HttpError(403, 'Apenas a gestão da equipe altera as fases.');
  const d = parse(saveSchema, req.body);
  const names = d.items.map(it => it.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new HttpError(400, 'Há fases com o mesmo nome.');

  await tx(async (c) => {
    await c.query('SELECT id FROM teams WHERE id = $1 FOR UPDATE', [id]);
    const current = await teamPhases(c, id);
    const byId = new Map(current.map(p => [p.id, p]));
    if (d.items.some(it => it.id && !byId.has(it.id))) {
      throw new HttpError(409, 'As fases da equipe mudaram. Recarregue e tente de novo.');
    }
    const kept = new Set(d.items.filter(it => it.id).map(it => it.id));
    const removed = current.filter(p => !kept.has(p.id));
    for (const p of removed) {
      const { rows: [u] } = await c.query(
        `SELECT COUNT(*) AS n FROM work_phase WHERE phase_id = $1 AND work_id IN (${TEAM_WORKS.replace('$1', '$2')})`, [p.id, id]
      );
      if (Number(u.n) > 0) throw new HttpError(409, `Há projetos na fase "${p.name}". Mova-os antes de excluir.`);
    }

    for (const [i, it] of d.items.entries()) {
      const days = clampPhaseDays(it.duration_days ?? byId.get(it.id)?.duration_days ?? 5);
      const own = it.id && byId.get(it.id).team_id === id;
      if (own) {
        await c.query('UPDATE team_phases SET name = $1, color = $2, position = $3, duration_days = $4 WHERE id = $5', [it.name, it.color, i, days, it.id]);
        continue;
      }
      const { rows: [n] } = await c.query(
        'INSERT INTO team_phases (team_id, name, color, position, duration_days) VALUES ($1, $2, $3, $4, $5) RETURNING id', [id, it.name, it.color, i, days]
      );
      if (it.id) {
        await c.query(`UPDATE work_phase SET phase_id = $1 WHERE phase_id = $2 AND work_id IN (${TEAM_WORKS.replace('$1', '$3')})`, [n.id, it.id, id]);
        await c.query(`UPDATE task_phase SET phase_id = $1 WHERE phase_id = $2 AND task_id IN (${TEAM_TASKS.replace('$1', '$3')})`, [n.id, it.id, id]);
      }
    }
    for (const p of removed) {
      if (p.team_id === id) await c.query('DELETE FROM team_phases WHERE id = $1', [p.id]);
      else await c.query(`DELETE FROM task_phase WHERE phase_id = $1 AND task_id IN (${TEAM_TASKS.replace('$1', '$2')})`, [p.id, id]);
    }
  });
  res.json({ phases: await teamPhases({ query }, id), can_edit: true });
}));

module.exports = router;
module.exports.canEdit = canEdit;
