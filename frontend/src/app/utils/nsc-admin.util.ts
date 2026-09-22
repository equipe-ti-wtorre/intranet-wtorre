import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  NscColaboradorAdmin,
  NscResumo,
  NscResumoDepartamento,
  NscStatus,
} from '../models/nsc.model';

export function formatarDataNsc(iso: string | null | undefined): string {
  if (!iso) return '—';
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(iso);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function labelStatusNsc(status: NscStatus): string {
  const map: Record<NscStatus, string> = {
    valido: 'Válido',
    a_vencer: 'A vencer',
    vencido: 'Vencido',
    pendente: 'Pendente',
    aguardando_aprovacao: 'Aguardando aprovação',
    nao_obrigatorio: 'Não obrigatório',
  };
  return map[status] || status;
}

export function gerarPdfRelatorioNsc(
  resumo: NscResumo,
  departamentos: NscResumoDepartamento[],
  colaboradores: NscColaboradorAdmin[],
  filtroDepto?: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.text('Relatório Não se Cale', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(80);
  const filtro = filtroDepto ? `Departamento: ${filtroDepto}` : 'Todos os departamentos';
  doc.text(
    `${filtro}  ·  Obrigatórios ${resumo.obrigatorios}  ·  Válidos ${resumo.validos}  ·  A vencer ${resumo.a_vencer}  ·  Vencidos ${resumo.vencidos}  ·  Pendentes ${resumo.pendentes}  ·  Irregulares ${resumo.irregulares}`,
    14,
    23
  );
  doc.setTextColor(16);

  autoTable(doc, {
    startY: 28,
    head: [['Departamento', 'Obrigatórios', 'Válidos', 'A vencer', 'Vencidos', 'Pendentes', 'Irregulares']],
    body: departamentos.map((d) => [
      d.departamento,
      d.obrigatorios,
      d.validos,
      d.a_vencer,
      d.vencidos,
      d.pendentes,
      d.irregulares,
    ]),
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [29, 84, 230], textColor: 255 },
  });

  const afterDepto = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY;
  autoTable(doc, {
    startY: (afterDepto || 28) + 8,
    head: [['Nome', 'Cargo', 'Departamento', 'E-mail', 'Status', 'Validade', 'Dias', 'Irregular']],
    body: colaboradores.map((c) => [
      c.nome || '—',
      c.cargo || '—',
      c.departamento || 'Sem departamento',
      c.email || '—',
      labelStatusNsc(c.status),
      formatarDataNsc(c.validade_efetiva),
      c.dias_restantes == null ? '—' : String(c.dias_restantes),
      c.irregular ? 'Sim' : 'Não',
    ]),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [29, 84, 230], textColor: 255 },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (filtroDepto || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  doc.save(`nsc-relatorio${slug ? `-${slug}` : ''}-${stamp}.pdf`);
}
