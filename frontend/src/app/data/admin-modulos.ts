/**
 * Espelha a ordem de backend/src/config/modulos-admin.js (módulos com rota admin).
 */
export const ADMIN_MODULO_ROTAS: { codigo: string; rota: string }[] = [
  { codigo: 'menu', rota: 'menu' },
  { codigo: 'rodape', rota: 'rodape' },
  { codigo: 'documentos', rota: 'documentos' },
  { codigo: 'treinamentos', rota: 'treinamentos' },
  { codigo: 'comunicados', rota: 'comunicados' },
  { codigo: 'eventos', rota: 'eventos' },
  { codigo: 'powerbi', rota: 'powerbi' },
  { codigo: 'containers', rota: 'containers' },
  { codigo: 'paginas', rota: 'paginas' },
  { codigo: 'tenants', rota: 'tenants' },
  { codigo: 'colaboradores', rota: 'colaboradores' },
  { codigo: 'configuracoes', rota: 'configuracoes' },
  { codigo: 'salas', rota: 'salas' },
  { codigo: 'camarotes', rota: 'camarotes' },
  { codigo: 'solicitacao-colaborador', rota: 'solicitacao-colaborador' },
  { codigo: 'followup-suprimentos', rota: 'followup-suprimentos' },
];

export function rotaParaModulo(path: string): string | null {
  const segment = path.split('/')[0];
  const found = ADMIN_MODULO_ROTAS.find((m) => m.rota === segment);
  return found?.codigo ?? null;
}
