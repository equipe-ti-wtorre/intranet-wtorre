const { dayOf } = require('./timeline');
const { notify } = require('./notify');

// Datas de um projeto: planejado (work_baseline, o combinado) e histórico (work_date_log).
// Edição manual muda o planejado e exige motivo; reajuste, pausa e fases só entram no histórico.

async function readDates(run, workId) {
  const { rows: [r] } = await run.query(
    `SELECT ws.start_date, s.due_date FROM project_sections s
       LEFT JOIN work_schedule ws ON ws.work_id = s.id WHERE s.id = $1`, [workId]
  );
  return { start: dayOf(r?.start_date) || null, due: dayOf(r?.due_date) || null };
}

const changed = (a, b) => (a.start || null) !== (b.start || null) || (a.due || null) !== (b.due || null);

async function logDates(run, { workId, kind, before, after, reason = null, causeId = null, userId = null }) {
  if (before && !changed(before, after)) return false;
  await run.query(
    `INSERT INTO work_date_log (work_id, kind, old_start, new_start, old_due, new_due, reason, cause_work_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [workId, kind, before?.start || null, after.start || null, before?.due || null, after.due || null, reason, causeId, userId]
  );
  return true;
}

async function setBaseline(run, workId, start, due, userId = null) {
  await run.query(
    `INSERT INTO work_baseline (work_id, start_date, due_date, updated_at, updated_by) VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (work_id) DO UPDATE SET start_date = EXCLUDED.start_date, due_date = EXCLUDED.due_date,
       updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [workId, start || null, due || null, userId]
  );
}

const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : 'sem data');
const move = (label, a, b) => ((a || null) === (b || null) ? null : `${label} ${dm(a)} → ${dm(b)}`);

// Aviso de mudança de data. O solicitante só é avisado quando o início muda e nunca vê a entrega.
async function notifyDates(run, { workId, kind, before, after, reason = null, causeName = null, total = null, actor }) {
  if (!before || !changed(before, after)) return;
  const { rows: [w] } = await run.query('SELECT name, project_id FROM project_sections WHERE id = $1', [workId]);
  if (!w) return;
  const title = kind === 'reajuste' ? `O projeto "${w.name}" foi reajustado pela entrada de "${causeName}"`
    : kind === 'fases' ? `As datas do projeto "${w.name}" mudaram com o roteiro de fases${total ? ` (${total} dias úteis)` : ''}`
    : `${actor.name} mudou as datas do projeto "${w.name}"`;
  const why = reason && kind === 'manual' ? `Motivo: ${reason}` : null;
  const startMove = move('Início', before.start, after.start);
  const full = [[startMove, move('Entrega', before.due, after.due)].filter(Boolean).join(' · '), why].filter(Boolean).join('\n');
  const { rows: devs } = await run.query(
    `SELECT user_id FROM work_owners WHERE work_id = $1
     UNION SELECT owner_id FROM project_sections WHERE id = $1 AND owner_id IS NOT NULL`, [workId]
  );
  const devIds = new Set(devs.map(r => r.user_id));
  for (const uid of devIds) {
    await notify(run, { userId: uid, actorId: actor.id, type: 'work_dates', projectId: w.project_id, title, body: full });
  }
  if (!startMove) return;
  const { rows: reqs } = await run.query('SELECT user_id FROM work_members WHERE work_id = $1', [workId]);
  for (const r of reqs) {
    if (devIds.has(r.user_id)) continue;
    await notify(run, { userId: r.user_id, actorId: actor.id, type: 'work_dates', projectId: w.project_id, title,
      body: [startMove, why].filter(Boolean).join('\n') });
  }
}

module.exports = { readDates, logDates, setBaseline, notifyDates, datesChanged: changed };
