import pptxgen from 'pptxgenjs';
import { DeckSlide } from './day-deck';

// Desenha no PowerPoint os slides montados (capa, números, colunas por período, tabela, listas).
const PALETTES = {
  wtorre: { brand: '1D54E6', soft: 'E8EEFD', dark: '0E1626' },
  'nubank-parque': { brand: '8D0DE3', soft: 'ECDFFF', dark: '2E0348' },
} as const;
const INK = '0F172A'; const MUTED = '64748B'; const LINE = 'E2E8F0'; const SURF = 'F8FAFC';
const RED = 'BE123C'; const AMBER = 'B45309'; const GREEN = '13A36B';
const FONT = 'Segoe UI';
const W = 13.333; const H = 7.5; const MX = 0.6;

export async function downloadDeckPptx(slides: DeckSlide[], palette: keyof typeof PALETTES, footer: string, fileBase: string) {
  const C = PALETTES[palette] || PALETTES.wtorre;
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'TaskHub';
  pres.title = slides.find(s => s.kind === 'cover')?.title || fileBase;
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
  pres.defineSlideMaster({ title: 'CAPA', background: { color: C.dark } });
  pres.defineSlideMaster({
    title: 'CONTEUDO', background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: C.brand } } },
      { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 0.35, w: W - 2 * MX, h: 0.75, fontFace: FONT, fontSize: 28, bold: true, color: INK, margin: 0, align: 'left', valign: 'middle' }, text: '' } },
      { text: { text: footer, options: { x: MX, y: H - 0.45, w: 8, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, margin: 0 } } },
    ],
    slideNumber: { x: W - MX - 0.6, y: H - 0.45, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: 'right' },
  });
  const toneColor = (t?: string) => (t === 'late' ? RED : t === 'warn' ? AMBER : t === 'brand' ? C.brand : t === 'muted' ? MUTED : INK);

  for (const sl of slides) {
    if (sl.kind === 'cover') {
      const s = pres.addSlide({ masterName: 'CAPA' });
      s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.25, h: H, fill: { color: C.brand } });
      s.addText('TaskHub', { x: 1, y: 0.8, w: 6, h: 0.5, fontFace: FONT, fontSize: 16, bold: true, color: 'FFFFFF', margin: 0, isTextBox: true });
      s.addText(sl.title, { x: 1, y: 2.3, w: 11, h: 1.6, fontFace: FONT, fontSize: 44, bold: true, color: 'FFFFFF', margin: 0, valign: 'bottom', isTextBox: true });
      s.addText(sl.subtitle, { x: 1, y: 4.05, w: 11, h: 0.5, fontFace: FONT, fontSize: 18, color: 'AAB2C8', margin: 0, isTextBox: true });
      s.addText(sl.meta, { x: 1, y: 4.75, w: 11, h: 0.5, fontFace: FONT, fontSize: 16, color: 'FFFFFF', margin: 0, isTextBox: true });
      s.addNotes(`${sl.subtitle}. ${sl.meta}.`);
      continue;
    }
    const s = pres.addSlide({ masterName: 'CONTEUDO' });
    s.addText(sl.title, { placeholder: 'title' });

    if (sl.kind === 'kpis') {
      const n = sl.items.length; const gap = 0.3; const cw = (W - 2 * MX - (n - 1) * gap) / n;
      sl.items.forEach((it, i) => {
        const x = MX + i * (cw + gap); const warn = it.tone === 'late' || it.tone === 'warn';
        s.addShape(pres.ShapeType.roundRect, { x, y: 1.5, w: cw, h: 2.1, rectRadius: 0.12, fill: { color: warn ? (it.tone === 'late' ? 'FFF1F2' : 'FEF3E2') : SURF }, line: { color: LINE, width: 1 } });
        s.addText(it.label, { x: x + 0.25, y: 1.65, w: cw - 0.5, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: warn ? toneColor(it.tone) : MUTED, margin: 0, isTextBox: true });
        s.addText(it.value, { x: x + 0.25, y: 2.1, w: cw - 0.5, h: 0.9, fontFace: FONT, fontSize: 44, bold: true, color: warn ? toneColor(it.tone) : INK, margin: 0, isTextBox: true });
        s.addText(it.sub, { x: x + 0.25, y: 3.05, w: cw - 0.5, h: 0.4, fontFace: FONT, fontSize: 12, color: MUTED, margin: 0, isTextBox: true });
      });
      if (sl.note) s.addText(sl.note, { x: MX, y: 4.1, w: W - 2 * MX, h: 0.5, fontFace: FONT, fontSize: 16, color: MUTED, margin: 0, isTextBox: true });
      s.addNotes(sl.items.map(i => `${i.label}: ${i.value}`).join('; '));
    }

    if (sl.kind === 'periods') {
      const n = sl.columns.length; const gap = 0.3; const cw = (W - 2 * MX - (n - 1) * gap) / n;
      sl.columns.forEach((c, i) => {
        const x = MX + i * (cw + gap);
        s.addShape(pres.ShapeType.roundRect, { x, y: 1.35, w: cw, h: 5.4, rectRadius: 0.12, fill: { color: c.now ? C.soft : SURF }, line: { color: c.now ? C.brand : LINE, width: c.now ? 1.5 : 1 } });
        s.addText(c.title + (c.now ? ' · agora' : ''), { x: x + 0.25, y: 1.5, w: cw - 0.5, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: c.now ? C.brand : INK, margin: 0, isTextBox: true });
        s.addText(c.sub, { x: x + 0.25, y: 1.95, w: cw - 0.5, h: 0.35, fontFace: FONT, fontSize: 12, color: MUTED, margin: 0, isTextBox: true });
        const rows = c.rows.slice(0, 9);
        if (!rows.length) s.addText('Nada neste período.', { x: x + 0.25, y: 2.5, w: cw - 0.5, h: 0.4, fontFace: FONT, fontSize: 13, color: MUTED, margin: 0, isTextBox: true });
        else s.addText(rows.flatMap(r => [
            { text: r.done ? '✓  ' : '○  ', options: { color: r.done ? GREEN : MUTED } },
            { text: r.cells[0], options: { breakLine: true, color: r.done ? MUTED : toneColor(r.tone), strike: r.done ? 'sngStrike' as const : undefined } },
          ]),
          { x: x + 0.25, y: 2.45, w: cw - 0.5, h: 4.1, fontFace: FONT, fontSize: 13, valign: 'top', margin: 0, paraSpaceAfter: 6, isTextBox: true });
        if (c.rows.length > 9) s.addText(`+${c.rows.length - 9} itens`, { x: x + 0.25, y: 6.35, w: cw - 0.5, h: 0.3, fontFace: FONT, fontSize: 11, color: MUTED, margin: 0, isTextBox: true });
      });
      s.addNotes(sl.columns.map(c => `${c.title}: ${c.sub}`).join('; '));
    }

    if (sl.kind === 'table') {
      if (!sl.rows.length) s.addText(sl.empty, { x: MX, y: 3.2, w: W - 2 * MX, h: 0.8, fontFace: FONT, fontSize: 18, color: MUTED, align: 'center', isTextBox: true });
      else {
        const colW = [5.2, 2.0, 3.2, 1.733];
        const head = sl.head.map(t => ({ text: t, options: { bold: true, color: MUTED, fill: { color: SURF }, fontSize: 12 } }));
        const body = sl.rows.slice(0, 11).map(r => r.cells.map((c, i) => ({ text: c, options: { color: i === 0 || i === 3 ? toneColor(r.tone) : INK } })));
        s.addTable([head, ...body] as pptxgen.TableRow[], { x: MX, y: 1.35, w: colW.reduce((a, b) => a + b, 0), colW, fontFace: FONT, fontSize: 13, color: INK, border: { type: 'solid', color: LINE, pt: 0.75 }, rowH: 0.42, valign: 'middle', margin: 0.08 });
      }
      s.addNotes(`${sl.rows.length} itens.`);
    }

    if (sl.kind === 'lists') {
      const n = sl.lists.length; const gap = 0.4; const cw = (W - 2 * MX - (n - 1) * gap) / n;
      sl.lists.forEach((l, i) => {
        const x = MX + i * (cw + gap);
        s.addText(l.title, { x, y: 1.3, w: cw, h: 0.45, fontFace: FONT, fontSize: 17, bold: true, color: toneColor(l.tone), margin: 0, isTextBox: true });
        if (!l.rows.length) s.addText(l.empty, { x, y: 1.9, w: cw, h: 0.4, fontFace: FONT, fontSize: 14, color: MUTED, margin: 0, isTextBox: true });
        else s.addTable(l.rows.map(r => [{ text: [{ text: r.main, options: { bold: true, breakLine: true } }, { text: r.sub, options: { color: MUTED, fontSize: 11 } }] }]) as unknown as pptxgen.TableRow[],
          { x, y: 1.85, w: cw, colW: [cw], fontFace: FONT, fontSize: 13, color: INK, border: { type: 'solid', color: LINE, pt: 0.75 }, valign: 'middle', margin: 0.1 });
      });
      s.addNotes(sl.lists.map(l => l.title).join('; '));
    }
  }
  await pres.writeFile({ fileName: `${fileBase}.pptx` });
}
