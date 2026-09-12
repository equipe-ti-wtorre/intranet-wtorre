import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { CamaroteUnidade } from '../models/camarote.model';
import { formatarAndar } from './camarote-andar.util';
import type { KpiModalModo } from '../shared/camarotes/camarotes-kpi-modal.component';

export interface ExportCamarotesModalPdfParams {
  titulo: string;
  subtitulo?: string;
  modo: KpiModalModo;
  unidades: CamaroteUnidade[];
}

function moeda(valor: number | null | undefined): string {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function texto(valor: string | null | undefined): string {
  return valor?.trim() || '—';
}

function formatData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function formatDiasRestantes(dias: number | null | undefined): string {
  if (dias == null || !Number.isFinite(Number(dias))) return '—';
  const n = Number(dias);
  if (n > 1) return `${n} dias`;
  if (n === 1) return '1 dia';
  if (n === 0) return 'Vence hoje';
  const abs = Math.abs(n);
  return abs === 1 ? 'Vencido há 1 dia' : `Vencido há ${abs} dias`;
}

function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildTable(modo: KpiModalModo, unidades: CamaroteUnidade[]): {
  head: string[][];
  body: string[][];
  columnStyles: Record<number, { halign?: 'left' | 'right' | 'center' }>;
} {
  switch (modo) {
    case 'vago':
      return {
        head: [['Número', 'Setor', 'Andar', 'Capacidade']],
        body: unidades.map((u) => [
          u.numero,
          texto(u.setor),
          formatarAndar(u.andar),
          u.capacidade != null ? String(u.capacidade) : '—',
        ]),
        columnStyles: { 3: { halign: 'right' } },
      };
    case 'pack30':
      return {
        head: [['Número', 'Setor', 'Cessionário', 'Pack30']],
        body: unidades.map((u) => [
          u.numero,
          texto(u.setor),
          texto(u.cessionario),
          u.pack30 ? 'Sim' : 'Não',
        ]),
        columnStyles: {},
      };
    case 'vvip':
      return {
        head: [['Número', 'Setor', 'Cessionário', 'Vagas VVIP', 'Valor vagas']],
        body: unidades.map((u) => [
          u.numero,
          texto(u.setor),
          texto(u.cessionario),
          u.vagas_vvip != null ? String(u.vagas_vvip) : '—',
          moeda(u.valor_vagas),
        ]),
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      };
    default:
      return {
        head: [
          [
            'Número',
            'Setor',
            'Andar',
            'Cessionário',
            'Tipo',
            'Início',
            'Término',
            'Dias p/ vencer',
            'Valor anual',
          ],
        ],
        body: unidades.map((u) => [
          u.numero,
          texto(u.setor),
          formatarAndar(u.andar),
          texto(u.cessionario),
          texto(u.tipo_cessionario),
          formatData(u.inicio_locacao),
          formatData(u.final_locacao),
          formatDiasRestantes(u.dias_restantes),
          moeda(u.valor_anual),
        ]),
        columnStyles: { 7: { halign: 'right' }, 8: { halign: 'right' } },
      };
  }
}

export function exportCamarotesModalPdf(params: ExportCamarotesModalPdfParams): void {
  const { titulo, subtitulo, modo, unidades } = params;
  if (!unidades.length) {
    throw new Error('Nenhuma unidade para exportar.');
  }

  const orientation = modo === 'contrato' ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

  const margin = 14;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(titulo, margin, y);
  y += 7;

  if (subtitulo?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(72, 83, 106);
    doc.text(subtitulo.trim(), margin, y);
    y += 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(138, 147, 168);
  const geradoEm = new Date().toLocaleString('pt-BR');
  doc.text(`Gerado em ${geradoEm} · ${unidades.length} unidade(s)`, margin, y);
  y += 4;
  doc.setTextColor(16, 21, 31);

  const { head, body, columnStyles } = buildTable(modo, unidades);

  autoTable(doc, {
    startY: y + 4,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [16, 21, 31],
      lineColor: [226, 230, 238],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [244, 245, 248],
      textColor: [138, 147, 168],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [252, 252, 253],
    },
    columnStyles,
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const filename = `camarotes-${slugify(titulo) || 'export'}-${hoje}.pdf`;
  doc.save(filename);
}
