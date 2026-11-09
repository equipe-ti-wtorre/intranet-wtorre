const { createDefaultStatuses } = require('./projects');
const { defaultPhases, projectPhases } = require('./phases');

// Quadro da equipe: o registro em projects que guarda os projetos (project_sections) da equipe.
// Não aparece como projeto; a tela da equipe é a tela dele.

async function boardOf(run, teamId) {
  const { rows: [b] } = await run.query('SELECT project_id FROM team_boards WHERE team_id = $1', [teamId]);
  return b?.project_id || null;
}

// Cria o quadro na primeira vez (equipe nova ou equipe que já existia antes desta mudança).
// Chamar dentro de tx: o FOR UPDATE na equipe evita dois quadros em acessos simultâneos.
async function ensureTeamBoard(c, teamId, actorId = null) {
  const { rows: [t] } = await c.query('SELECT id, name, color, description FROM teams WHERE id = $1 FOR UPDATE', [teamId]);
  if (!t) return null;
  const existing = await boardOf(c, teamId);
  if (existing) return existing;
  const { rows: [p] } = await c.query(
    `INSERT INTO projects (team_id, name, description, color, visibility, owner_id, created_by, space)
     VALUES ($1, $2, $3, $4, 'equipe', NULL, $5, 'profissional') RETURNING id`,
    [t.id, t.name, t.description || '', t.color || '#3b82f6', actorId]
  );
  await createDefaultStatuses(c, p.id);
  await c.query('INSERT INTO team_boards (team_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [t.id, p.id]);
  return (await boardOf(c, teamId)) || p.id;
}

async function teamOfBoard(run, projectId) {
  const { rows: [b] } = await run.query('SELECT team_id FROM team_boards WHERE project_id = $1', [projectId]);
  return b?.team_id || null;
}

// Quadro individual: um por pessoa. Os projetos pessoais são os cartões dele.
async function personalBoardOf(run, userId) {
  const { rows: [b] } = await run.query('SELECT project_id FROM personal_boards WHERE user_id = $1', [userId]);
  return b?.project_id || null;
}

const phaseKey = (name) => String(name || '').trim().toLocaleLowerCase('pt-BR');

// Na primeira abertura, os projetos individuais antigos (cada um um quadro) viram cartões deste.
async function ensurePersonalBoard(c, userId) {
  const { rows: [u] } = await c.query('SELECT id, color FROM users WHERE id = $1 FOR UPDATE', [userId]);
  if (!u) return null;
  const existing = await personalBoardOf(c, userId);
  if (existing) return existing;

  const { rows: [p] } = await c.query(
    `INSERT INTO projects (team_id, name, description, color, visibility, owner_id, created_by, space)
     VALUES (NULL, 'Individual', '', $1, 'privado', $2, $2, 'pessoal') RETURNING id`,
    [u.color || '#c9a84c', userId]
  );
  await createDefaultStatuses(c, p.id);
  await c.query('INSERT INTO personal_boards (user_id, project_id) VALUES ($1, $2)', [userId, p.id]);

  const { rows: olds } = await c.query(
    `SELECT id, name, description, color, start_date, end_date
       FROM projects
      WHERE space = 'pessoal' AND owner_id = $1 AND id <> $2`,
    [userId, p.id]
  );
  if (olds.length) {
    await unifyPhases(c, p.id, userId, olds.map(o => o.id));
    const { rows: boardStatuses } = await c.query(
      'SELECT id, name, category FROM workflow_statuses WHERE project_id = $1 ORDER BY position, id', [p.id]
    );
    const byName = new Map(boardStatuses.map(s => [phaseKey(s.name), s.id]));
    const byCat = new Map();
    for (const s of boardStatuses) if (!byCat.has(s.category)) byCat.set(s.category, s.id);

    for (const old of olds) {
      const { rows: sections } = await c.query('SELECT id FROM project_sections WHERE project_id = $1 ORDER BY position, id', [old.id]);
      const { rows: [{ n: loose }] } = await c.query(
        'SELECT COUNT(*) AS n FROM tasks WHERE project_id = $1 AND section_id IS NULL', [old.id]
      );
      let holder = sections[0]?.id || null;
      if (!sections.length) {
        holder = await addPersonalCard(c, p.id, userId, {
          name: old.name, description: old.description, color: old.color,
          start_date: old.start_date, due_date: old.end_date,
        });
      }
      if (!sections.length && holder) {
        await c.query('UPDATE tasks SET section_id = $1 WHERE project_id = $2 AND section_id IS NULL', [holder, old.id]);
      } else if (Number(loose) > 0 && sections[0]) {
        await c.query('UPDATE tasks SET section_id = $1 WHERE project_id = $2 AND section_id IS NULL', [sections[0].id, old.id]);
      }
      await c.query('UPDATE project_sections SET project_id = $1 WHERE project_id = $2', [p.id, old.id]);

      const { rows: oldStatuses } = await c.query(
        'SELECT id, name, category FROM workflow_statuses WHERE project_id = $1', [old.id]
      );
      for (const st of oldStatuses) {
        const dest = byName.get(phaseKey(st.name)) || byCat.get(st.category) || byCat.get('todo');
        if (dest) await c.query('UPDATE tasks SET status_id = $1 WHERE project_id = $2 AND status_id = $3', [dest, old.id, st.id]);
      }
      await c.query('UPDATE tasks SET project_id = $1 WHERE project_id = $2', [p.id, old.id]);
      await c.query('UPDATE notifications SET project_id = $1 WHERE project_id = $2', [p.id, old.id]);
      await c.query('DELETE FROM projects WHERE id = $1', [old.id]);
    }
  }
  return p.id;
}

// Uma lista só de fases para o quadro, casando as listas antigas pelo nome.
async function unifyPhases(c, boardId, userId, oldIds) {
  const own = [];
  const works = [];
  for (const pid of oldIds) {
    const { rows: phases } = await c.query(
      `SELECT tp.id, tp.name, tp.color, tp.position, tp.duration_days
         FROM team_phases tp JOIN project_phases pp ON pp.phase_id = tp.id
        WHERE pp.project_id = $1 ORDER BY tp.position, tp.id`, [pid]
    );
    own.push(...phases);
    const { rows: cards } = await c.query(
      `SELECT s.id, wp.phase_id
         FROM project_sections s
         LEFT JOIN work_phase wp ON wp.work_id = s.id
        WHERE s.project_id = $1`, [pid]
    );
    works.push(...cards.map(w => ({ ...w, project_id: pid })));
  }

  const defaults = await defaultPhases(c);
  if (!own.length) {
    const first = defaults[0]?.id;
    if (first) {
      for (const w of works) if (!w.phase_id) await placeOnPhase(c, w.id, first, userId);
    }
    return;
  }

  const byName = new Map();
  for (const ph of own) {
    const key = phaseKey(ph.name);
    if (!key) continue;
    const cur = byName.get(key);
    if (!cur) byName.set(key, { name: String(ph.name).trim().slice(0, 60), color: ph.color, duration_days: Number(ph.duration_days) || 0, position: ph.position, ids: [ph.id] });
    else cur.ids.push(ph.id);
  }
  const list = [...byName.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'));
  const idMap = new Map();
  const created = [];
  for (let i = 0; i < list.length; i++) {
    const ph = list[i];
    const days = Math.min(365, Math.max(0, Number(ph.duration_days) || 0));
    const { rows: [row] } = await c.query(
      `INSERT INTO team_phases (team_id, name, color, position, duration_days) VALUES (NULL, $1, $2, $3, $4) RETURNING id`,
      [ph.name, ph.color || '#8b93a1', i, days]
    );
    await c.query('INSERT INTO project_phases (phase_id, project_id) VALUES ($1, $2)', [row.id, boardId]);
    created.push({ id: row.id, key: phaseKey(ph.name) });
    for (const oldId of ph.ids) idMap.set(oldId, row.id);
  }
  for (const d of defaults) {
    const hit = created.find(x => x.key === phaseKey(d.name));
    if (hit) idMap.set(d.id, hit.id);
  }
  const fallback = created[0]?.id;
  for (const w of works) await remapWorkPhase(c, w, idMap, fallback, userId);
  for (const pid of oldIds) await remapTaskPhases(c, pid, idMap, fallback);
  for (const ph of own) await c.query('DELETE FROM team_phases WHERE id = $1', [ph.id]);
}

async function placeOnPhase(c, workId, phaseId, userId) {
  const { rows: [work] } = await c.query('SELECT project_id FROM project_sections WHERE id = $1', [workId]);
  const { rows: [end] } = await c.query(
    `SELECT COALESCE(MAX(wp.board_position), 0) + 1000 AS n
       FROM work_phase wp JOIN project_sections s ON s.id = wp.work_id
      WHERE s.project_id = $1 AND wp.phase_id = $2`,
    [work?.project_id, phaseId]
  );
  await c.query(
    'INSERT INTO work_phase (work_id, phase_id, board_position, changed_by) VALUES ($1, $2, $3, $4)',
    [workId, phaseId, Number(end?.n) || 1000, userId]
  );
}

async function remapWorkPhase(c, work, idMap, fallback, userId) {
  const dest = work.phase_id ? (idMap.get(work.phase_id) || fallback) : null;
  if (work.phase_id && dest && dest !== work.phase_id) {
    await c.query('UPDATE work_phase SET phase_id = $1 WHERE work_id = $2', [dest, work.id]);
  } else if (!work.phase_id && fallback) {
    await placeOnPhase(c, work.id, fallback, userId);
  }
  const { rows: logs } = await c.query('SELECT id, phase_id FROM work_phase_log WHERE work_id = $1', [work.id]);
  for (const log of logs) {
    const to = idMap.get(log.phase_id) || fallback;
    if (to && to !== log.phase_id) await c.query('UPDATE work_phase_log SET phase_id = $1 WHERE id = $2', [to, log.id]);
  }
}

async function remapTaskPhases(c, projectId, idMap, fallback) {
  const { rows } = await c.query(
    `SELECT tp.task_id, tp.phase_id
       FROM task_phase tp JOIN tasks t ON t.id = tp.task_id
      WHERE t.project_id = $1`, [projectId]
  );
  for (const row of rows) {
    const to = idMap.get(row.phase_id) || fallback;
    if (to && to !== row.phase_id) await c.query('UPDATE task_phase SET phase_id = $1 WHERE task_id = $2', [to, row.task_id]);
  }
}

// Cartão novo no quadro individual. O desenvolvedor é a própria pessoa.
async function addPersonalCard(c, boardId, userId, fields) {
  const { rows: [pos] } = await c.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM project_sections WHERE project_id = $1 AND position < 999',
    [boardId]
  );
  const name = String(fields.name || 'Projeto').trim().slice(0, 100);
  const color = /^#[0-9a-fA-F]{6}$/.test(fields.color || '') ? fields.color : '#4c8dff';
  const { rows: [w] } = await c.query(
    `INSERT INTO project_sections (project_id, name, description, owner_id, due_date, color, created_by, position)
     VALUES ($1, $2, $3, $4, $5, $6, $4, $7) RETURNING id`,
    [boardId, name, fields.description || '', userId, fields.due_date || null, color, Number(pos?.n) || 0]
  );
  await c.query('INSERT INTO work_owners (work_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [w.id, userId]);
  if (fields.start_date) {
    await c.query('INSERT INTO work_schedule (work_id, start_date, duration_days) VALUES ($1, $2, 5)', [w.id, fields.start_date]);
  }
  const phases = await projectPhases(c, boardId);
  if (phases[0]) await placeOnPhase(c, w.id, phases[0].id, userId);
  return w.id;
}

module.exports = {
  boardOf, ensureTeamBoard, teamOfBoard, personalBoardOf, ensurePersonalBoard, addPersonalCard,
};
