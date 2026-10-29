import { Person, Priority, Project } from './models';
import { addDaysIso, todayIso } from './format';

export interface ParsedTask {
  title: string; due_date: string | null; priority: Priority | null; assignee: Person | null;
  // Cada @pessoa vira "Alinhado com"; assignee fica com a primeira para quem ainda usa.
  contacts: Person[];
  project: Project | null; estimate_min: number | null; chips: string[];
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, segunda: 1, 'segunda-feira': 1, terca: 2, 'terça': 2, 'terça-feira': 2, 'terca-feira': 2,
  quarta: 3, 'quarta-feira': 3, quinta: 4, 'quinta-feira': 4, sexta: 5, 'sexta-feira': 5, sabado: 6, 'sábado': 6,
};
const PRIO: Record<string, Priority> = { critica: 'critica', 'crítica': 'critica', urgente: 'critica', alta: 'alta', media: 'media', 'média': 'media', baixa: 'baixa' };

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Interpreta "Revisar contrato sexta @ana !alta #compras ~2h".
export function parseQuickTask(input: string, people: Person[], projects: Project[]): ParsedTask {
  let text = ` ${input} `;
  const chips: string[] = [];
  let due: string | null = null; let priority: Priority | null = null;
  let assignee: Person | null = null; let project: Project | null = null; let estimate: number | null = null;
  const today = todayIso();

  text = text.replace(/\s!(\p{L}+)/u, (m, w) => {
    const p = PRIO[w.toLowerCase()];
    if (!p) return m;
    priority = p; chips.push(`Prioridade ${w}`);
    return ' ';
  });

  const contacts: Person[] = [];
  text = text.replace(/\s@([a-z0-9._-]+)/gi, (m, u) => {
    const found = people.find(p => p.username?.toLowerCase() === u.toLowerCase())
      || people.find(p => norm(p.name).split(' ')[0] === norm(u));
    if (!found) return m;
    if (!contacts.some(c => c.id === found.id)) { contacts.push(found); chips.push(`Alinhado com ${found.name}`); }
    assignee = assignee || found;
    return ' ';
  });

  text = text.replace(/\s#([\p{L}0-9._-]+)/u, (m, w) => {
    const key = norm(w);
    const found = projects.find(p => norm(p.name).replace(/\s+/g, '') === key)
      || projects.find(p => norm(p.name).replace(/\s+/g, '').startsWith(key))
      || projects.find(p => norm(p.name).includes(key));
    if (!found) return m;
    project = found; chips.push(`Projeto ${found.name}`);
    return ' ';
  });

  text = text.replace(/\s~(\d+(?:[.,]\d+)?)\s*(h|min|m)\b/i, (_, n, unit) => {
    const v = parseFloat(n.replace(',', '.'));
    estimate = Math.round(unit.toLowerCase() === 'h' ? v * 60 : v);
    chips.push(`Estimativa ${n}${unit}`);
    return ' ';
  });

  const dateRules: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [/\s(hoje)\s/i, () => today],
    [/\s(depois de amanh[ãa])\s/i, () => addDaysIso(today, 2)],
    [/\s(amanh[ãa])\s/i, () => addDaysIso(today, 1)],
    [/\sem (\d{1,3}) dias?\s/i, m => addDaysIso(today, Number(m[1]))],
    [/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, m => {
      const d = Number(m[1]); const mo = Number(m[2]);
      let y = m[3] ? Number(m[3]) : new Date().getFullYear();
      if (y < 100) y += 2000;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      let iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (!m[3] && iso < today) iso = `${y + 1}${iso.slice(4)}`;
      return iso;
    }],
    [/\s(?:na |no |até |ate )?(domingo|segunda(?:-feira)?|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado)\s/i, m => {
      const target = WEEKDAYS[m[1].toLowerCase()] ?? WEEKDAYS[norm(m[1])];
      if (target === undefined) return null;
      const now = new Date().getDay();
      let diff = (target - now + 7) % 7; if (diff === 0) diff = 7;
      return addDaysIso(today, diff);
    }],
  ];
  for (const [re, fn] of dateRules) {
    const m = text.match(re);
    if (m) {
      const iso = fn(m);
      if (iso) { due = iso; text = text.replace(m[0], ' '); chips.push(`Prazo ${m[0].trim()}`); break; }
    }
  }

  return { title: text.replace(/\s+/g, ' ').trim(), due_date: due, priority, assignee, contacts, project, estimate_min: estimate, chips };
}
