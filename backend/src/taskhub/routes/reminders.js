const { isRealDate } = require('../lib/dates');
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { nextOccurrence } = require('../lib/dates');
const { ah, HttpError } = require('../lib/http');

const router = express.Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)').refine(isRealDate, 'Data inexistente no calendário');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (use HH:MM)');
const repeatSchema = z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']);

const reminderSchema = z.object({
  date: dateSchema,
  time: timeSchema,
  title: z.string().trim().min(1).max(300),
  done: z.boolean().optional(),
  notified: z.boolean().optional(),
  repeat: repeatSchema.optional(),
});

const updateReminderSchema = reminderSchema.partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar' });

const CAN_SEE = `(r.user_id = $1 OR EXISTS (SELECT 1 FROM reminder_members m WHERE m.reminder_id = r.id AND m.user_id = $1))`;

// Lembretes que a pessoa vê (os dela e os compartilhados com ela), já com dono e participantes.
async function loadReminders(meId, where = '', extra = []) {
  const { rows } = await query(
    `SELECT r.*, o.name AS owner_name FROM reminders r JOIN users o ON o.id = r.user_id
      WHERE ${CAN_SEE} ${where} ORDER BY r.reminder_date ASC, r.reminder_time ASC`,
    [meId, ...extra]
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { rows: mem } = await query(
    `SELECT m.reminder_id, u.id, u.name FROM reminder_members m JOIN users u ON u.id = m.user_id
      WHERE m.reminder_id IN (${ids.map((_, i) => '$' + (i + 1)).join(',')}) ORDER BY u.name`,
    ids
  );
  const members = new Map();
  for (const m of mem) {
    if (!members.has(m.reminder_id)) members.set(m.reminder_id, []);
    members.get(m.reminder_id).push({ id: m.id, name: m.name });
  }
  return rows.map((r) => ({
    ...mapReminder(r),
    is_owner: r.user_id === meId,
    owner: { id: r.user_id, name: r.owner_name },
    members: members.get(r.id) || [],
  }));
}

// Acesso a um lembrete: dono (edita tudo) ou participante (vê, conclui e pode sair).
async function accessReminder(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Lembrete não encontrado');
  const { rows: [row] } = await query(
    `SELECT r.* FROM reminders r WHERE r.id = $2 AND ${CAN_SEE}`, [req.user.id, id]
  );
  if (!row) throw new HttpError(404, 'Lembrete não encontrado');
  return { id, row, isOwner: row.user_id === req.user.id };
}

function mapReminder(row) {
  return {
    id: row.id,
    date: row.reminder_date,
    time: row.reminder_time?.slice(0, 5),
    title: row.title,
    done: row.done,
    repeat: row.repeat || 'none',
    notified: row.notified,
    createdAt: row.created_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { date, from, to } = req.query;
    const conditions = [];
    const params = [];
    let i = 2;

    if (date) { conditions.push(`r.reminder_date = $${i++}`); params.push(date); }
    if (from) { conditions.push(`r.reminder_date >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`r.reminder_date <= $${i++}`); params.push(to); }

    res.json(await loadReminders(req.user.id, conditions.map((c) => 'AND ' + c).join(' '), params));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = reminderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados inválidos' });
  }
  try {
    const { date, time, title, repeat } = parsed.data;
    const { rows } = await query(
      `INSERT INTO reminders (reminder_date, reminder_time, title, user_id, repeat) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [date, time, title, req.user.id, repeat || 'none']
    );
    const [created] = await loadReminders(req.user.id, 'AND r.id = $2', [rows[0].id]);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', ah(async (req, res) => {
  const parsed = updateReminderSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || 'Dados inválidos');
  const { id, row: cur, isOwner } = await accessReminder(req);
  const data = parsed.data;
  // Participante só conclui/reabre; o resto é do dono.
  if (!isOwner && Object.keys(data).some((k) => k !== 'done')) {
    throw new HttpError(403, 'Só quem criou o lembrete pode alterá-lo.');
  }
  const reply = async () => res.json((await loadReminders(req.user.id, 'AND r.id = $2', [id]))[0]);

  if (data.done === true && cur.repeat && cur.repeat !== 'none') {
    const nextDate = nextOccurrence(cur.reminder_date, cur.repeat);
    await query('UPDATE reminders SET reminder_date = $1, done = false, notified = false WHERE id = $2', [nextDate, id]);
    return reply();
  }
  const fields = [];
  const params = [];
  let i = 1;
  if (data.date !== undefined) { fields.push(`reminder_date = $${i++}`); params.push(data.date); }
  if (data.time !== undefined) { fields.push(`reminder_time = $${i++}`); params.push(data.time); }
  if (data.title !== undefined) { fields.push(`title = $${i++}`); params.push(data.title); }
  if (data.repeat !== undefined) { fields.push(`repeat = $${i++}`); params.push(data.repeat); }
  if (data.done !== undefined) { fields.push(`done = $${i++}`); params.push(data.done); }
  if (data.notified !== undefined && isOwner) { fields.push(`notified = $${i++}`); params.push(data.notified); }
  else if (data.date !== undefined || data.time !== undefined) { fields.push('notified = false'); }
  // Ao mudar data/hora de um lembrete concluído, ele volta a valer.
  if ((data.date !== undefined || data.time !== undefined) && data.done === undefined) fields.push('done = false');
  if (!fields.length) return reply();
  params.push(id);
  await query(`UPDATE reminders SET ${fields.join(', ')} WHERE id = $${i}`, params);
  return reply();
}));

// Quem criou escolhe com quem compartilhar.
router.put('/:id/members', ah(async (req, res) => {
  const { id, isOwner } = await accessReminder(req);
  if (!isOwner) throw new HttpError(403, 'Só quem criou o lembrete escolhe com quem compartilhar.');
  const parsed = z.object({ user_ids: z.array(z.number().int().positive()).max(100) }).safeParse(req.body || {});
  if (!parsed.success) throw new HttpError(400, 'Lista de pessoas inválida');
  const seen = new Set();
  const valid = [];
  for (const uid of parsed.data.user_ids) {
    if (uid === req.user.id || seen.has(uid)) continue;
    seen.add(uid);
    const { rows: [u] } = await query('SELECT id FROM users WHERE id = $1 AND active IS DISTINCT FROM false', [uid]);
    if (u) valid.push(uid);
  }
  await query('DELETE FROM reminder_members WHERE reminder_id = $1', [id]);
  for (const uid of valid) {
    await query('INSERT INTO reminder_members (reminder_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, uid]);
  }
  res.json((await loadReminders(req.user.id, 'AND r.id = $2', [id]))[0]);
}));

router.delete('/:id', ah(async (req, res) => {
  const { id, isOwner } = await accessReminder(req);
  if (isOwner) {
    await query('DELETE FROM reminders WHERE id = $1', [id]);
    return res.json({ message: 'Lembrete excluído' });
  }
  await query('DELETE FROM reminder_members WHERE reminder_id = $1 AND user_id = $2', [id, req.user.id]);
  res.json({ message: 'Você saiu do lembrete' });
}));

module.exports = router;
