function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function parseDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const s = String(value);
    const iso = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const s = String(value).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return formatYmd(Number(br[3]), Number(br[2]), Number(br[1]));
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function formatDateBr(value) {
  if (!value) return '—';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getDate())}/${pad2(value.getMonth() + 1)}/${value.getFullYear()}`;
  }
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-');
  if (y && m && d && /^\d{4}$/.test(y)) return `${pad2(d)}/${pad2(m)}/${y}`;
  return s;
}

module.exports = { parseDate, formatYmd, formatDateBr };
