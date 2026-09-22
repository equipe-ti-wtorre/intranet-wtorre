import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { CipaEvento, CipaInscricao } from '../models/cipa.model';
import { formatCpfMask } from './cpf';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export function formatarDataCipaLonga(iso: string): string {
  const raw = String(iso || '');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const mes = MESES[Number(match[2]) - 1];
  if (!mes) return `${match[3]}/${match[2]}/${match[1]}`;
  return `${Number(match[3])} de ${mes}`;
}

export function formatarDataCipaExtenso(iso: string): string {
  const raw = String(iso || '');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const ano = Number(match[1]);
  const mesNum = Number(match[2]);
  const dia = Number(match[3]);
  const mes = MESES[mesNum - 1];
  if (!mes) return `${match[3]}/${match[2]}/${match[1]}`;
  const weekday = DIAS_SEMANA[new Date(ano, mesNum - 1, dia).getDay()];
  return `${weekday}, ${dia} de ${mes} de ${ano}`;
}

export function formatarDataHoraPt(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function hojeIsoLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isMesAtual(iso: string | undefined): boolean {
  if (!iso) return false;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
}

export function baixarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function gerarPdfInscritosCipa(evento: CipaEvento, inscritos: CipaInscricao[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.text('Inscrições Agenda RH', 14, 16);
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(`${evento.titulo} · ${formatarDataCipaLonga(evento.data)}`, 14, 24);
  doc.setTextColor(16);
  autoTable(doc, {
    startY: 30,
    head: [['Horário', 'Nome', 'E-mail', 'CPF', 'Data']],
    body: inscritos.map((i) => [
      i.horario || '—',
      i.nome_completo || '—',
      i.email || '—',
      formatCpfMask(i.cpf),
      formatarDataHoraPt(i.criado_em),
    ]),
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [29, 84, 230], textColor: 255 },
  });
  doc.save(`cipa-inscritos-${evento.codigo || evento.id}.pdf`);
}

export { formatCpfMask as formatarCpfCipa };
