const { HttpError } = require('./http');

// Fases dos projetos do quadro. Cada equipe tem a lista dela; sem lista própria, vale a padrão (team_id NULL).

function withDays(rows) {
  return rows.map((r) => ({ ...r, duration_days: Math.min(365, Math.max(0, Number(r.duration_days) || 0)) }));
}

async function teamPhases(run, teamId) {
  if (teamId) {
    const { rows } = await run.query(
      'SELECT id, team_id, name, color, position, duration_days FROM team_phases WHERE team_id = $1 ORDER BY position, id', [teamId]
    );
    if (rows.length) return withDays(rows);
  }
  const { rows } = await run.query(
    'SELECT id, team_id, name, color, position, duration_days FROM team_phases WHERE team_id IS NULL ORDER BY position, id'
  );
  return withDays(rows);
}

async function projectTeam(run, projectId) {
  const { rows: [r] } = await run.query('SELECT team_id FROM projects WHERE id = $1', [projectId]);
  return r?.team_id || null;
}

async function projectPhases(run, projectId) {
  return teamPhases(run, await projectTeam(run, projectId));
}

async function assertProjectPhase(run, projectId, phaseId) {
  const phases = await projectPhases(run, projectId);
  if (!phases.some(p => p.id === phaseId)) throw new HttpError(400, 'Fase inválida para este projeto.');
}

async function workPhase(run, workId) {
  const { rows: [r] } = await run.query('SELECT phase_id FROM work_phase WHERE work_id = $1', [workId]);
  return r?.phase_id || null;
}

async function setTaskPhase(run, taskId, phaseId) {
  if (!phaseId) {
    await run.query('DELETE FROM task_phase WHERE task_id = $1', [taskId]);
    return;
  }
  await run.query(
    `INSERT INTO task_phase (task_id, phase_id) VALUES ($1, $2)
     ON CONFLICT (task_id) DO UPDATE SET phase_id = EXCLUDED.phase_id`, [taskId, phaseId]
  );
}

module.exports = { teamPhases, projectTeam, projectPhases, assertProjectPhase, workPhase, setTaskPhase };
