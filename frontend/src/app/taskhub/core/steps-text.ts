// Descrição que vira etapas: linha começando com "-", "*", "•" ou "[ ]" é uma etapa.
const BULLET = /^\s*(?:[-*•]|\[\s?\])\s+/;

const clean = (line: string) => line.replace(BULLET, '').trim();

// Enter no fim da linha: com marcador (ou anyLine ligado) tira a linha e devolve o texto da etapa.
export function takeBulletLine(text: string, caret: number, anyLine = false): { step: string; text: string; caret: number } | null {
  const start = text.lastIndexOf('\n', caret - 1) + 1;
  const endIdx = text.indexOf('\n', caret);
  const end = endIdx < 0 ? text.length : endIdx;
  if (text.slice(caret, end).trim()) return null;
  const line = text.slice(start, end);
  if (!anyLine && !BULLET.test(line)) return null;
  const step = clean(line);
  if (!step) return null;
  const before = text.slice(0, start).replace(/\n$/, '');
  const after = text.slice(end).replace(/^\n/, '');
  // A linha vira etapa e fica uma linha vazia no lugar, pronta para o próximo "- ".
  const head = before ? `${before}\n` : '';
  return { step, text: head + (after ? `\n${after}` : ''), caret: head.length };
}

// "Transformar linhas em etapas": o trecho selecionado sai da descrição e vira etapas.
// Sem seleção, todas as linhas viram etapas e a descrição fica como está (nada da anotação se perde).
export function linesToSteps(text: string, selStart = 0, selEnd = 0): { steps: string[]; text: string } {
  const hasSel = selEnd > selStart;
  const from = hasSel ? text.lastIndexOf('\n', selStart - 1) + 1 : 0;
  const toIdx = hasSel ? text.indexOf('\n', selEnd - 1) : -1;
  const to = hasSel ? (toIdx < 0 ? text.length : toIdx) : text.length;
  const steps = text.slice(from, to).split('\n').map(clean).filter(Boolean).map(s => s.slice(0, 500));
  if (!hasSel) return { steps, text };
  const before = text.slice(0, from).replace(/\n$/, '');
  const after = text.slice(to).replace(/^\n/, '');
  return { steps, text: before && after ? `${before}\n${after}` : before || after };
}
