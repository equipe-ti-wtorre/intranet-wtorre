// Seleção padrão de tarefa. O parâmetro $1 é SEMPRE o id do usuário atual,
// usado para calcular o acesso dele à tarefa.
const TASK_SELECT = `
  SELECT t.id, t.title, t.notes AS description, t.priority, t.deadline AS due_date, t.start_date,
         t.estimate_min, t.size, t.completed_at, t.position, t.is_private, t.blocked_reason, t.tags,
         t.created_at, t.updated_at,
         t.project_id, p.name AS project_name, p.color AS project_color, p.team_id,
         t.section_id, sec.name AS section_name,
         tph.phase_id, sph.name AS phase_name, sph.color AS phase_color,
         t.status_id, ws.name AS status_name, ws.color AS status_color,
         COALESCE(ws.category, CASE WHEN t.completed_at IS NOT NULL THEN 'done' ELSE 'todo' END) AS status_category,
         t.assignee_id, a.name AS assignee_name, a.initials AS assignee_initials,
         a.color AS assignee_color, a.username AS assignee_username,
         t.created_by, c.name AS creator_name,
         (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtasks_total,
         (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done) AS subtasks_done,
         (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comments_count,
         th_task_access($1, t.id) AS access,
         pt.name AS team_name, COALESCE(p.space, t.space) AS space,
         (SELECT COALESCE(json_agg(json_build_object('id', s.id, 'title', s.title, 'due_date', s.due_date) ORDER BY s.position), '[]')
            FROM subtasks s WHERE s.task_id = t.id AND s.assignee_id = $1 AND NOT s.done) AS my_steps
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN teams pt ON pt.id = p.team_id
    LEFT JOIN project_sections sec ON sec.id = t.section_id
    LEFT JOIN task_phase tph ON tph.task_id = t.id
    LEFT JOIN team_phases sph ON sph.id = tph.phase_id
    LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users c ON c.id = t.created_by
`;

// Tarefa "está comigo": sou o responsável ou tenho uma etapa pendente nela.
const SPACE_SQL = `COALESCE(p.space, t.space)`;
// Tamanho → minutos equivalentes (para carga e capacidade). Sem tamanho: estimativa ou 30 min.
const SIZE_MIN = { P: 30, M: 90, G: 180 };
const DAY_REF_MIN = 420; // 7 h por dia, referência fixa da carga (não é mais configurável por pessoa)
const loadMin = (t) => {
  const size = t.size ? String(t.size).trim() : '';
  return SIZE_MIN[size] || (t.estimate_min ?? 30);
};

const MINE_SQL = (param = '$1') => `(t.assignee_id = ${param} OR EXISTS (SELECT 1 FROM subtasks ms WHERE ms.task_id = t.id AND ms.assignee_id = ${param} AND NOT ms.done))`;

const OPEN_CATEGORIES = ['todo', 'doing', 'blocked'];
const STATUS_CATEGORY_SQL = `COALESCE(ws.category, CASE WHEN t.completed_at IS NOT NULL THEN 'done' ELSE 'todo' END)`;

function formatTask(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description || '',
    priority: r.priority || 'media',
    due_date: r.due_date || null,
    start_date: r.start_date || null,
    estimate_min: r.estimate_min ?? null,
    size: r.size ? String(r.size).trim() : null,
    completed_at: r.completed_at,
    position: r.position,
    is_private: !!r.is_private,
    space: r.space || 'profissional',
    blocked_reason: r.blocked_reason || null,
    tags: r.tags || [],
    project: r.project_id ? { id: r.project_id, name: r.project_name, color: r.project_color, team_id: r.team_id, team_name: r.team_name } : null,
    section: r.section_id ? { id: r.section_id, name: r.section_name } : null,
    phase: r.phase_id ? { id: r.phase_id, name: r.phase_name, color: r.phase_color } : null,
    status: {
      id: r.status_id || null,
      name: r.status_name || (r.status_category === 'done' ? 'Concluído' : 'A fazer'),
      color: r.status_color || (r.status_category === 'done' ? '#22c55e' : '#8b93a1'),
      category: r.status_category,
    },
    assignee: r.assignee_id ? {
      id: r.assignee_id, name: r.assignee_name, initials: r.assignee_initials,
      color: r.assignee_color, username: r.assignee_username,
    } : null,
    created_by: r.created_by ? { id: r.created_by, name: r.creator_name } : null,
    subtasks_total: r.subtasks_total || 0,
    subtasks_done: r.subtasks_done || 0,
    comments_count: r.comments_count || 0,
    access: r.access,
    my_steps: r.my_steps || [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

async function loadTask(run, userId, taskId) {
  const { rows } = await run.query(`${TASK_SELECT} WHERE t.id = $2`, [userId, taskId]);
  if (!rows[0] || !rows[0].access) return null;
  return formatTask(rows[0]);
}

async function logActivity(run, taskId, userId, type, fromValue = null, toValue = null) {
  const { rows: [row] } = await run.query(
    `INSERT INTO task_activity (task_id, user_id, type, from_value, to_value) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [taskId, userId, type,
      fromValue == null ? null : String(fromValue).slice(0, 200),
      toValue == null ? null : String(toValue).slice(0, 200)]
  );
  return row?.id ?? null;
}

module.exports = { SIZE_MIN, DAY_REF_MIN, loadMin, SPACE_SQL, MINE_SQL, TASK_SELECT, OPEN_CATEGORIES, STATUS_CATEGORY_SQL, formatTask, loadTask, logActivity };
