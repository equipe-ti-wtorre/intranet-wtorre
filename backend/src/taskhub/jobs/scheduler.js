const { query } = require('../db');
const { notify } = require('../lib/notify');
const { isEnabled } = require('../lib/entra');
const { syncDirectory } = require('../lib/entra-sync');
const { isoDate, nextOccurrence, occursAt, localTimestamp } = require('../lib/dates');
const { STATUS_CATEGORY_SQL } = require('../lib/tasks');

const OPEN = `${STATUS_CATEGORY_SQL} IN ('todo','doing','blocked')`;

// Executa uma vez por chave (ex.: uma vez por dia), mesmo com reinícios.
async function once(name, key, fn) {
  const { rowCount } = await query(
    'INSERT INTO job_runs (name, run_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [name, key]
  );
  if (rowCount) await fn();
}

// O mesmo aviso não lido não se repete no dia seguinte. Lido ou arquivado, volta se ainda estiver vencendo.
async function hasUnread(userId, type, taskId, projectId, body) {
  const { rows } = await query(
    `SELECT 1 AS ok FROM notifications
      WHERE user_id = $1 AND type = $2 AND read_at IS NULL AND archived_at IS NULL
        AND task_id <=> $3 AND project_id <=> $4 AND ($5 IS NULL OR body = $5)
      LIMIT 1`,
    [userId, type, taskId, projectId, body]
  );
  return rows.length > 0;
}

async function notifyOnce(note) {
  if (await hasUnread(note.userId, note.type, note.taskId ?? null, note.projectId ?? null, note.matchBody ?? null)) return;
  await notify(null, note);
}

// Avisos diários às 8h: tarefa e projeto que vencem hoje, e os que já estão atrasados.
async function dailyDueNotifications() {
  const now = new Date();
  if (now.getHours() < 8) return;
  const today = isoDate(now);
  await once('due-notifications', today, async () => {
    const { rows: dueToday } = await query(
      `SELECT t.id, t.title, t.assignee_id, t.project_id FROM tasks t
         LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
        WHERE t.deadline = $1 AND t.assignee_id IS NOT NULL AND ${OPEN}`, [today]
    );
    for (const t of dueToday) {
      await notifyOnce({ userId: t.assignee_id, actorId: null, type: 'due_today', taskId: t.id,
        projectId: t.project_id, title: 'O prazo desta tarefa é hoje', body: t.title });
    }
    const { rows: overdue } = await query(
      `SELECT t.id, t.title, t.assignee_id, t.created_by, t.project_id FROM tasks t
         LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
        WHERE t.deadline < $1 AND ${OPEN}`, [today]
    );
    for (const t of overdue) {
      for (const uid of new Set([t.assignee_id, t.created_by].filter(Boolean))) {
        await notifyOnce({ userId: uid, actorId: null, type: 'overdue', taskId: t.id,
          projectId: t.project_id, title: 'Tarefa atrasada', body: t.title });
      }
    }
    const { rows: works } = await query(
      `SELECT s.id, s.name, s.project_id, s.due_date, s.owner_id,
              (SELECT b.team_id FROM team_boards b WHERE b.project_id = s.project_id LIMIT 1) AS team_id
         FROM project_sections s
        WHERE s.completed_at IS NULL AND s.due_date IS NOT NULL AND s.due_date <= $1`, [today]
    );
    const workIds = works.map(w => w.id);
    const { rows: ownerRows } = workIds.length
      ? await query('SELECT work_id, user_id FROM work_owners WHERE work_id = ANY($1)', [workIds])
      : { rows: [] };
    const ownersOf = new Map();
    for (const o of ownerRows) {
      if (!ownersOf.has(o.work_id)) ownersOf.set(o.work_id, []);
      ownersOf.get(o.work_id).push(o.user_id);
    }
    for (const w of works) {
      const noun = w.team_id ? 'projeto' : 'trabalho';
      const dueTodayWork = w.due_date === today;
      const people = ownersOf.get(w.id)?.length ? ownersOf.get(w.id) : [w.owner_id].filter(Boolean);
      const title = dueTodayWork
        ? `O prazo deste ${noun} é hoje`
        : `${noun === 'projeto' ? 'Projeto' : 'Trabalho'} atrasado`;
      for (const uid of new Set(people)) {
        await notifyOnce({
          userId: uid, actorId: null, type: dueTodayWork ? 'work_due_today' : 'work_overdue',
          projectId: w.project_id, title, body: w.name, matchBody: w.name,
        });
      }
    }
    await query(`DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`);
    await query(`DELETE FROM job_runs WHERE ran_at < NOW() - INTERVAL '60 days'`);
  });
}

// Na hora marcada, avisa a Caixa de entrada. Repetição avança para a próxima data.
async function dueReminders() {
  const { rows } = await query(
    `UPDATE reminders SET notified = true
      WHERE done = false AND notified = false
        AND (reminder_date + reminder_time) <= $1::timestamp
      RETURNING *`,
    [localTimestamp()]
  );
  for (const row of rows) {
    try {
      await notify(null, {
        userId: row.user_id, actorId: null, type: 'reminder',
        title: 'Lembrete', body: row.title,
      });
      if (row.repeat && row.repeat !== 'none') {
        let next = nextOccurrence(row.reminder_date, row.repeat);
        let guard = 0;
        while (occursAt(next, row.reminder_time).getTime() <= Date.now() && guard++ < 400) {
          next = nextOccurrence(next, row.repeat);
        }
        await query(
          'UPDATE reminders SET reminder_date = $1, notified = false WHERE id = $2',
          [next, row.id]
        );
      }
    } catch (err) {
      await query('UPDATE reminders SET notified = false WHERE id = $1', [row.id]);
      throw err;
    }
  }
}

async function entraSync() {
  if (!(await isEnabled())) return;
  const today = isoDate(new Date());
  await once('entra-sync', today, async () => {
    try {
      await syncDirectory();
    } catch (err) {
      await query('DELETE FROM job_runs WHERE name = $1 AND run_key = $2', ['entra-sync', today]);
      throw err;
    }
  });
}

function startScheduler() {
  const daily = () => dailyDueNotifications().catch(err => console.error('Agendador:', err.message));
  const reminders = () => dueReminders().catch(err => console.error('Lembretes:', err.message));
  const directory = () => entraSync().catch(err => console.error('Sync AD:', err.message));
  setTimeout(daily, 5000);
  setTimeout(reminders, 5000);
  setTimeout(directory, 8000);
  setInterval(daily, 10 * 60 * 1000);
  setInterval(directory, 10 * 60 * 1000);
  return setInterval(reminders, 60 * 1000);
}

module.exports = { startScheduler };
