import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { RowInput } from 'jspdf-autotable';
import type { MassagemAdminReserva } from '../models/massagem.model';

export interface ExportMassagemPresencaPdfParams {
  titulo: string;
  unidade: string;
  dataLabel: string;
  dataIso: string;
  duracaoMin: number;
  reservas: MassagemAdminReserva[];
}

type JsPdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function horaFimSlot(hora: string, duracaoMin: number): string {
  const [h, m] = String(hora).split(':').map(Number);
  const dur = Number.isFinite(duracaoMin) && duracaoMin > 0 ? duracaoMin : 50;
  if (![h, m].every((n) => Number.isFinite(n))) return '';
  const t = h * 60 + m + dur;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function faixa(hora: string, duracaoMin: number): string {
  const inicio = String(hora || '').slice(0, 5);
  const fim = horaFimSlot(inicio, duracaoMin);
  return fim ? `${inicio} – ${fim}` : inicio || '—';
}

function texto(valor: string | null | undefined): string {
  return valor?.trim() || '—';
}

function sortByHora(a: MassagemAdminReserva, b: MassagemAdminReserva): number {
  return String(a.hora || '').localeCompare(String(b.hora || ''));
}

function tableFinalY(doc: jsPDF, fallback: number): number {
  return (doc as JsPdfWithTable).lastAutoTable?.finalY ?? fallback;
}

const TABLE_STYLES = {
  styles: {
    font: 'helvetica' as const,
    fontSize: 8,
    cellPadding: 2.5,
    textColor: [16, 21, 31] as [number, number, number],
    lineColor: [226, 230, 238] as [number, number, number],
    lineWidth: 0.1,
  },
  headStyles: {
    fillColor: [244, 245, 248] as [number, number, number],
    textColor: [138, 147, 168] as [number, number, number],
    fontStyle: 'bold' as const,
    fontSize: 7.5,
  },
  alternateRowStyles: {
    fillColor: [252, 252, 253] as [number, number, number],
  },
};

function drawSection(
  doc: jsPDF,
  title: string,
  rows: MassagemAdminReserva[],
  duracaoMin: number,
  startY: number,
  margin: number
): number {
  const pageH = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageH - 40) {
    doc.addPage();
    y = margin;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 21, 31);
  doc.text(`${title} (${rows.length})`, margin, y);

  const emptyColor: [number, number, number] = [138, 147, 168];
  const body: RowInput[] = rows.length
    ? rows.map((r) => [texto(r.nome), texto(r.email), faixa(r.hora, duracaoMin)])
    : [
        [
          {
            content: 'Nenhum colaborador nesta lista.',
            colSpan: 3,
            styles: { halign: 'center', textColor: emptyColor },
          },
        ],
      ];

  autoTable(doc, {
    startY: y + 3,
    head: [['Nome', 'E-mail', 'Horário']],
    body,
    margin: { left: margin, right: margin },
    ...TABLE_STYLES,
    columnStyles: { 2: { halign: 'right' } },
  });

  return tableFinalY(doc, y) + 12;
}

export function exportMassagemPresencaPdf(params: ExportMassagemPresencaPdfParams): void {
  const { titulo, unidade, dataLabel, dataIso, duracaoMin, reservas } = params;
  const presentes = reservas.filter((r) => r.status === 'presente').sort(sortByHora);
  const faltas = reservas.filter((r) => r.status === 'falta').sort(sortByHora);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(16, 21, 31);
  doc.text(`Presença — ${titulo || 'Evento'}`, margin, y);
  y += 7;

  const subtitulo = [unidade?.trim() || '—', dataLabel?.trim()].filter(Boolean).join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(72, 83, 106);
  doc.text(subtitulo, margin, y);
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(138, 147, 168);
  const geradoEm = new Date().toLocaleString('pt-BR');
  doc.text(
    `Gerado em ${geradoEm} · ${presentes.length} compareceram · ${faltas.length} faltaram`,
    margin,
    y
  );
  y += 8;
  doc.setTextColor(16, 21, 31);

  y = drawSection(doc, 'Compareceram', presentes, duracaoMin, y, margin);
  drawSection(doc, 'Faltaram', faltas, duracaoMin, y, margin);

  const filename = `presenca-${slugify(titulo) || 'evento'}-${(dataIso || '').slice(0, 10) || 'export'}.pdf`;
  doc.save(filename);
}
