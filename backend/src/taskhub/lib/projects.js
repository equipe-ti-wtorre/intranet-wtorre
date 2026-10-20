const DEFAULT_STATUSES = [
  { name: 'A fazer', color: '#8b93a1', category: 'todo' },
  { name: 'Em andamento', color: '#3b82f6', category: 'doing' },
  { name: 'Em revisão', color: '#a78bfa', category: 'doing' },
  { name: 'Bloqueado', color: '#ef4444', category: 'blocked' },
  { name: 'Concluído', color: '#22c55e', category: 'done' },
  { name: 'Cancelado', color: '#6b7280', category: 'canceled' },
];

async function createDefaultStatuses(client, projectId, list = DEFAULT_STATUSES) {
  const created = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const { rows } = await client.query(
      `INSERT INTO workflow_statuses (project_id, name, color, category, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectId, s.name, s.color, s.category, i]
    );
    created.push(rows[0]);
  }
  return created;
}

module.exports = { DEFAULT_STATUSES, createDefaultStatuses };
