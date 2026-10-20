import pptxgen from 'pptxgenjs';
import { DashItem, WorkDashboard } from '../core/models';
import { HEALTH_LABEL, SLIDES, SlideKey, fmtDate, weekLabel } from './slides';

// Cores por paleta (hex sem "#", como o PowerPoint exige).
const PALETTES = {
  wtorre: { brand: '1D54E6', brandSoft: 'E8EEFD', dark: '0E1626', dark2: '121D33' },
  'nubank-parque': { brand: '8D0DE3', brandSoft: 'ECDFFF', dark: '2E0348', dark2: '420465' },
} as const;
const INK = '0F172A'; const MUTED = '64748B'; const LINE = 'E2E8F0'; const SURF = 'F8FAFC';
const RED = 'E11D48'; const AMBER = 'B45309'; const GREEN = '13A36B';
const FONT = 'Segoe UI';
const W = 13.333; const H = 7.5; const MX = 0.6;

const hex = (c: string | null | undefined, fb = '94A3B8') => (c || '').replace('#', '').slice(0, 6).toUpperCase() || fb;

// Gera e baixa o .pptx com os slides escolhidos.
export async function downloadWorkPptx(d: WorkDashboard, keys: SlideKey[], palette: keyof typeof PALETTES, title: string) {
  const C = PALETTES[palette] || PALETTES.wtorre;
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = title;
  pres.subject = `Status do trabalho ${d.subject.name}`;
  pres.author = 'TaskHub';
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

  // Layouts: capa escura e conteúdo claro (título, rodapé e número da página ficam no layout).
  pres.defineSlideMaster({ title: 'CAPA', background: { color: C.dark } });
  pres.defineSlideMaster({
    title: 'CONTEUDO',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: C.brand } } },
      { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 0.35, w: W - 2 * MX, h: 0.75, fontFace: FONT, fontSize: 28, bold: true, color: INK, margin: 0, align: 'left', valign: 'middle' }, text: '' } },
      { text: { text: `TaskHub · ${d.subject.project_name} › ${d.subject.name}`, options: { x: MX, y: H - 0.45, w: 8, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, margin: 0 } } },
    ],
    slideNumber: { x: W - MX - 0.6, y: H - 0.45, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: 'right' },
  });

  const content = (titleText: string) => {
    const s = pres.addSlide({ masterName: 'CONTEUDO' });
    s.addText(titleText, { placeholder: 'title' });
    return s;
  };
  const empty = (s: pptxgen.Slide, text: string) =>
    s.addText(text, { x: MX, y: 3.2, w: W - 2 * MX, h: 0.8, fontFace: FONT, fontSize: 18, color: MUTED, align: 'center', isTextBox: true });
  const head = (labels: string[]) => labels.map(t => ({ text: t, options: { bold: true, color: MUTED, fill: { color: SURF }, fontSize: 12 } }));
  const tableOpts = (colW: number[], y = 1.35) => ({
    x: MX, y, w: colW.reduce((a, b) => a + b, 0), colW, fontFace: FONT, fontSize: 13, color: INK,
    border: { type: 'solid' as const, color: LINE, pt: 0.75 }, rowH: 0.42, valign: 'middle' as const, margin: 0.08,
  });
  const itemRows = (items: DashItem[], last: (i: DashItem) => string) =>
    items.slice(0, 10).map(i => [i.title, i.status || '—', i.assignee || '—', last(i)]);

  const k = d.kpis; const p = d.subject;
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  for (const key of SLIDES.map(s => s.key).filter(x => keys.includes(x))) {
    if (key === 'capa') {
      const s = pres.addSlide({ masterName: 'CAPA' });
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: H, fill: { color: C.brand } });
      s.addText('TaskHub', { x: 1, y: 0.8, w: 6, h: 0.5, fontFace: FONT, fontSize: 16, bold: true, color: 'FFFFFF', margin: 0, isTextBox: true });
      s.addText(title, { x: 1, y: 2.3, w: 11, h: 1.6, fontFace: FONT, fontSize: 44, bold: true, color: 'FFFFFF', margin: 0, valign: 'bottom', isTextBox: true });
      s.addText([`Projeto ${p.project_name}`, p.owner_name ? `Responsável: ${p.owner_name}` : null, p.end_date ? `Prazo ${fmtDate(p.end_date)}` : null].filter(Boolean).join('  ·  '),
        { x: 1, y: 4.05, w: 11, h: 0.5, fontFace: FONT, fontSize: 18, color: 'AAB2C8', margin: 0, isTextBox: true });
      s.addShape(pres.ShapeType.roundRect, { x: 1, y: 4.9, w: 2.1, h: 0.5, rectRadius: 0.1, fill: { color: p.health === 'no_prazo' || p.health === 'concluido' ? GREEN : p.health === 'em_risco' ? AMBER : RED } });
      s.addText(HEALTH_LABEL[p.health], { x: 1, y: 4.9, w: 2.1, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true });
      s.addText(date, { x: 1, y: H - 1, w: 6, h: 0.4, fontFace: FONT, fontSize: 14, color: 'AAB2C8', margin: 0, isTextBox: true });
      s.addNotes(`Status do trabalho ${p.name} (projeto ${p.project_name}) em ${date}.`);
    }

    if (key === 'resumo') {
      const s = content('Resumo');
      const cards: [string, string, string][] = [
        ['Progresso', `${k.pct}%`, `${k.done} de ${k.total} tarefas concluídas`],
        ['Em andamento', `${k.doing}`, `${k.open} abertas no total`],
        ['Atrasadas', `${k.overdue}`, k.overdue ? 'precisam de atenção' : 'nenhuma atrasada'],
        ['Bloqueadas', `${k.blocked}`, k.blocked ? 'aguardando algo' : 'nada bloqueado'],
      ];
      const cw = (W - 2 * MX - 3 * 0.3) / 4;
      cards.forEach(([label, value, sub], i) => {
        const x = MX + i * (cw + 0.3);
        const warn = (label === 'Atrasadas' || label === 'Bloqueadas') && value !== '0';
        s.addShape(pres.ShapeType.roundRect, { x, y: 1.4, w: cw, h: 1.9, rectRadius: 0.12, fill: { color: warn ? 'FFF1F2' : SURF }, line: { color: warn ? 'FECDD3' : LINE, width: 1 } });
        s.addText(label, { x: x + 0.25, y: 1.55, w: cw - 0.5, h: 0.35, fontFace: FONT, fontSize: 13, color: warn ? 'BE123C' : MUTED, bold: true, margin: 0, isTextBox: true });
        s.addText(value, { x: x + 0.25, y: 1.95, w: cw - 0.5, h: 0.8, fontFace: FONT, fontSize: 40, bold: true, color: warn ? 'BE123C' : INK, margin: 0, isTextBox: true });
        s.addText(sub, { x: x + 0.25, y: 2.8, w: cw - 0.5, h: 0.35, fontFace: FONT, fontSize: 12, color: MUTED, margin: 0, isTextBox: true });
      });
      const bar = (y: number, label: string, pct: number, color: string) => {
        s.addText(`${label} · ${pct}%`, { x: MX, y, w: 6, h: 0.35, fontFace: FONT, fontSize: 14, color: INK, bold: true, margin: 0, isTextBox: true });
        s.addShape(pres.ShapeType.roundRect, { x: MX, y: y + 0.45, w: W - 2 * MX, h: 0.28, rectRadius: 0.14, fill: { color: LINE } });
        if (pct > 0) s.addShape(pres.ShapeType.roundRect, { x: MX, y: y + 0.45, w: Math.max(0.3, (W - 2 * MX) * pct / 100), h: 0.28, rectRadius: 0.14, fill: { color } });
      };
      bar(3.75, 'Tarefas concluídas', k.pct, C.brand);
      if (k.time_pct !== null) {
        bar(4.85, 'Tempo decorrido até o prazo', k.time_pct, '94A3B8');
        const gap = k.time_pct - k.pct;
        s.addText(gap > 10 ? `O ritmo está ${gap} pontos abaixo do calendário.` : 'O ritmo acompanha o prazo do trabalho.',
          { x: MX, y: 5.95, w: W - 2 * MX, h: 0.4, fontFace: FONT, fontSize: 14, color: gap > 10 ? 'BE123C' : MUTED, margin: 0, isTextBox: true });
      }
      s.addNotes(`${k.pct}% concluído, ${k.overdue} atrasadas e ${k.blocked} bloqueadas.`);
    }

    if (key === 'andamento') {
      const s = content('Em andamento');
      if (!d.doing.length) empty(s, 'Nenhuma tarefa em andamento agora.');
      else s.addTable([head(['Tarefa', 'Status', 'Responsável', 'Prazo']), ...itemRows(d.doing, i => fmtDate(i.due_date))] as pptxgen.TableRow[], tableOpts([5.0, 3.0, 2.3, 1.833]));
      s.addNotes(`${d.doing.length} tarefas em andamento.`);
    }

    if (key === 'status') {
      const s = content('Situação das tarefas');
      const st = d.by_status.filter(x => x.count > 0);
      if (!st.length) empty(s, 'Nenhuma tarefa ainda.');
      else {
        s.addChart(pres.ChartType.doughnut, [{ name: 'Tarefas', labels: st.map(x => x.name), values: st.map(x => x.count) }], {
          x: MX, y: 1.3, w: 7, h: 5.4, holeSize: 55, chartColors: st.map(x => hex(x.color)),
          showLegend: true, legendPos: 'r', legendFontFace: FONT, legendFontSize: 14, legendColor: INK,
          showValue: true, showPercent: false, dataLabelColor: 'FFFFFF', dataLabelFontSize: 13, dataLabelFontFace: FONT,
          showTitle: false,
        });
        s.addText(`${k.total}`, { x: 8.2, y: 2.5, w: 4.5, h: 1.2, fontFace: FONT, fontSize: 60, bold: true, color: INK, margin: 0, isTextBox: true });
        s.addText('tarefas no total', { x: 8.2, y: 3.7, w: 4.5, h: 0.5, fontFace: FONT, fontSize: 16, color: MUTED, margin: 0, isTextBox: true });
        s.addText(`${k.open} abertas · ${k.done} concluídas`, { x: 8.2, y: 4.3, w: 4.5, h: 0.5, fontFace: FONT, fontSize: 16, color: MUTED, margin: 0, isTextBox: true });
      }
      s.addNotes(st.map(x => `${x.name}: ${x.count}`).join('; ') || 'Sem tarefas.');
    }

    if (key === 'evolucao') {
      const s = content('Evolução semanal');
      const labels = d.weekly.map(w => weekLabel(w.week));
      s.addChart(pres.ChartType.bar, [
        { name: 'Criadas', labels, values: d.weekly.map(w => w.created) },
        { name: 'Concluídas', labels, values: d.weekly.map(w => w.done) },
      ], {
        x: MX, y: 1.3, w: W - 2 * MX, h: 5.4, barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 60,
        chartColors: ['CBD5E1', C.brand], showLegend: true, legendPos: 't', legendFontFace: FONT, legendFontSize: 13, legendColor: INK,
        showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: MUTED, dataLabelFontFace: FONT,
        catAxisLabelColor: MUTED, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 12,
        valAxisLabelColor: MUTED, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 11,
        valGridLine: { color: LINE, size: 0.75 }, catGridLine: { style: 'none' }, showTitle: false,
      });
      s.addNotes('Tarefas criadas e concluídas por semana, nas últimas 8 semanas.');
    }

    if (key === 'prazos') {
      const s = content('Próximos prazos');
      if (!d.upcoming.length) empty(s, 'Nada vence nos próximos 14 dias.');
      else s.addTable([head(['Tarefa', 'Status', 'Responsável', 'Prazo']), ...itemRows(d.upcoming, i => fmtDate(i.due_date))] as pptxgen.TableRow[], tableOpts([5.0, 3.0, 2.3, 1.833]));
      s.addNotes(`${d.upcoming.length} tarefas vencem nos próximos 14 dias.`);
    }

    if (key === 'atencao') {
      const s = content('Atrasadas e bloqueios');
      if (!d.overdue.length && !d.blocked.length) empty(s, 'Nada atrasado nem bloqueado.');
      else {
        const half = (W - 2 * MX - 0.4) / 2;
        s.addText(`Atrasadas (${d.overdue.length})`, { x: MX, y: 1.3, w: half, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: 'BE123C', margin: 0, isTextBox: true });
        s.addText(`Bloqueadas (${d.blocked.length})`, { x: MX + half + 0.4, y: 1.3, w: half, h: 0.4, fontFace: FONT, fontSize: 16, bold: true, color: AMBER, margin: 0, isTextBox: true });
        const ov = d.overdue.slice(0, 8).map(i => [`${i.title}\n${i.assignee || 'sem responsável'}`, fmtDate(i.due_date)]);
        const bl = d.blocked.slice(0, 8).map(i => [`${i.title}\n${i.blocked_reason || 'Sem motivo informado'}`, i.assignee || '—']);
        const opts = (x: number) => ({ x, y: 1.85, w: half, colW: [half - 1.4, 1.4], fontFace: FONT, fontSize: 12, color: INK, border: { type: 'solid' as const, color: LINE, pt: 0.75 }, valign: 'middle' as const, margin: 0.08 });
        if (ov.length) s.addTable(ov as pptxgen.TableRow[], opts(MX)); else s.addText('Nenhuma.', { x: MX, y: 1.9, w: half, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED, isTextBox: true });
        if (bl.length) s.addTable(bl as pptxgen.TableRow[], opts(MX + half + 0.4)); else s.addText('Nenhuma.', { x: MX + half + 0.4, y: 1.9, w: half, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED, isTextBox: true });
      }
      s.addNotes(`${d.overdue.length} atrasadas e ${d.blocked.length} bloqueadas.`);
    }

    if (key === 'equipe') {
      const s = content('Equipe');
      if (!d.by_person.length) empty(s, 'Nenhuma tarefa com responsável.');
      else s.addTable([head(['Pessoa', 'Abertas', 'Atrasadas', 'Concluídas']), ...d.by_person.slice(0, 12).map(p2 => [
        p2.name, `${p2.open}`, { text: `${p2.overdue}`, options: { color: p2.overdue ? 'BE123C' : MUTED, bold: !!p2.overdue } }, `${p2.done}`,
      ])] as pptxgen.TableRow[], tableOpts([6.133, 2, 2, 2]));
      s.addNotes('Distribuição das tarefas por pessoa.');
    }

    if (key === 'entregas') {
      const s = content('Concluídas na semana');
      if (!d.done_week.length) empty(s, 'Nenhuma tarefa concluída nos últimos 7 dias.');
      else s.addTable([head(['Tarefa', 'Status', 'Responsável', 'Concluída em']), ...itemRows(d.done_week, i => fmtDate(i.completed_at))] as pptxgen.TableRow[], tableOpts([5.0, 3.0, 2.3, 1.833]));
      s.addNotes(`${d.done_week.length} tarefas concluídas nos últimos 7 dias.`);
    }
  }

  const safe = `${d.subject.project_name}-${d.subject.name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  await pres.writeFile({ fileName: `status-${safe || 'trabalho'}-${new Date().toISOString().slice(0, 10)}.pptx` });
}
