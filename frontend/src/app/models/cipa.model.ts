export type CipaEstado = 'aberto' | 'encerrado';
export type CipaTextoAlinhamento = 'esquerda' | 'centro' | 'direita';
export type CipaTextoCampo =
  | 'categoria'
  | 'titulo'
  | 'texto'
  | 'data'
  | 'localizacao'
  | 'vagas'
  | 'duracao'
  | 'sobre';

export interface CipaTextoEstilo {
  tamanho: number;
  alinhamento: CipaTextoAlinhamento;
}

export type CipaTextoEstilos = Record<CipaTextoCampo, CipaTextoEstilo>;

export interface CipaSlot {
  id: number;
  evento_id?: number;
  horario: string;
  vagas: number;
  inscritos: number;
  vagas_restantes: number;
}

export interface CipaVisualizador {
  usuario_id: number;
  colaborador_id: number | null;
  nome_completo: string;
  email: string;
  departamento?: string | null;
}

export interface CipaEvento {
  id: number;
  codigo: string;
  data: string;
  titulo: string;
  texto: string;
  categoria: string;
  localizacao: string;
  estado: CipaEstado;
  duracao_slot_min: number;
  oculto_lista: boolean;
  link_publico: boolean;
  tem_imagem: boolean;
  imagem_zoom?: number;
  imagem_tamanho?: number;
  imagem_altura?: number;
  imagem_pos_x?: number;
  imagem_pos_y?: number;
  texto_tamanho?: number;
  texto_alinhamento?: CipaTextoAlinhamento;
  texto_estilos?: CipaTextoEstilos | string | null;
  criado_em?: string;
  atualizado_em?: string;
  inscritos?: number;
  visualizadores_count?: number;
  slots?: CipaSlot[];
  visualizadores?: CipaVisualizador[];
}

export interface CipaInscricao {
  id: number;
  slot_id: number;
  evento_id: number;
  usuario_id: number | null;
  nome_completo: string;
  email: string;
  cpf: string;
  horario: string;
  criado_em: string;
}

export interface CipaInscritosResposta {
  evento: CipaEvento;
  inscritos: CipaInscricao[];
}

export interface CipaInscricaoResposta {
  ok: boolean;
  message: string;
  inscricao_id: number;
  email_enviado: boolean;
}
