// Datas no fuso do servidor (configure TZ=America/Sao_Paulo).
function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoDate(dt);
}

function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Segunda-feira da semana do dia informado.
function weekStart(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7;
  return addDays(iso, -dow);
}

function weekday(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

// Próxima data de um lembrete que se repete. A data atual não entra.
function nextOccurrence(iso, repeat) {
  const day = String(iso).slice(0, 10);
  if (repeat === 'weekly') return addDays(day, 7);
  if (repeat === 'monthly') {
    const [y, m, d] = day.split('-').map(Number);
    const target = new Date(y, m, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d, last));
    return isoDate(target);
  }
  if (repeat === 'weekdays') {
    let n = addDays(day, 1);
    for (let i = 0; i < 7; i++) {
      const dow = weekday(n);
      if (dow !== 0 && dow !== 6) return n;
      n = addDays(n, 1);
    }
    return n;
  }
  return addDays(day, 1);
}

// Instante local do lembrete (o processo usa TZ=America/Sao_Paulo).
function occursAt(iso, time) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(time).slice(0, 5).split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

function localTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

module.exports = { isoDate, addDays, isIsoDate, weekStart, nextOccurrence, occursAt, localTimestamp };
