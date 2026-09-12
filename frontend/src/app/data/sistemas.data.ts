export interface Sistema {
  nome: string;
  subtitulo: string;
  icon: 'user' | 'wallet' | 'badge' | 'database' | 'cloud' | 'check' | 'task' | 'building' | 'phone';
}

export const SISTEMAS: Sistema[] = [
  { nome: 'Portal RH', subtitulo: 'Metadados', icon: 'user' },
  { nome: 'Reembolsos', subtitulo: 'MEGA', icon: 'wallet' },
  { nome: 'Credenciamento', subtitulo: 'Acessos', icon: 'badge' },
  { nome: 'Oracle EBS', subtitulo: 'ERP', icon: 'database' },
  { nome: 'Mega Cloud', subtitulo: 'Nuvem', icon: 'cloud' },
  { nome: 'Aprovações', subtitulo: 'Portal', icon: 'check' },
  { nome: 'Task Center', subtitulo: 'Mega', icon: 'task' },
  { nome: 'Gestão de Ativos', subtitulo: 'Patrimônio', icon: 'building' },
  { nome: 'Telefonia', subtitulo: 'Controle', icon: 'phone' },
];
