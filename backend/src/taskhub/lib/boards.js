const { createDefaultStatuses } = require('./projects');

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

// Nome do cartão nas mensagens: no quadro da equipe é "projeto"; nos projetos individuais, "trabalho".
async function workNoun(run, projectId) {
  return (await teamOfBoard(run, projectId)) ? 'projeto' : 'trabalho';
}

module.exports = { boardOf, ensureTeamBoard, teamOfBoard, workNoun };
