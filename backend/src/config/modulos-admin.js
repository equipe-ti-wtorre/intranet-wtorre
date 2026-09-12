const MODULOS = [
  { codigo: 'menu', nome: 'Gestão do Menu', ordem: 1 },
  { codigo: 'rodape', nome: 'Rodapé', ordem: 2 },
  { codigo: 'documentos', nome: 'Documentos', ordem: 3 },
  { codigo: 'treinamentos', nome: 'Treinamentos', ordem: 4 },
  { codigo: 'containers', nome: 'Containers', ordem: 5 },
  { codigo: 'tenants', nome: 'Tenants Azure', ordem: 6 },
  { codigo: 'colaboradores', nome: 'Sincronização AD', ordem: 7 },
  { codigo: 'configuracoes', nome: 'Configurações', ordem: 8 },
  { codigo: 'paginas', nome: 'Páginas', ordem: 9 },
  { codigo: 'camarotes', nome: 'Gestão de Camarotes', ordem: 10 },
  { codigo: 'solicitacao-colaborador', nome: 'Solicitação de Colaborador', ordem: 11 },
  { codigo: 'comunicados', nome: 'Comunicados', ordem: 12 },
  { codigo: 'eventos', nome: 'Eventos', ordem: 13 },
  { codigo: 'powerbi', nome: 'Power BI', ordem: 14 },
  { codigo: 'salas', nome: 'Reservas de Salas', ordem: 15 },
  { codigo: 'followup-suprimentos', nome: 'Follow-up de Suprimentos', ordem: 16 },
  { codigo: 'massagem', nome: 'Massagem', ordem: 17 },
  { codigo: 'pesquisas', nome: 'Central de Pesquisas', ordem: 18 },
  { codigo: 'rustdesk', nome: 'Rust Desk', ordem: 19 },
];

const CODIGOS = new Set(MODULOS.map((m) => m.codigo));

function isCodigoValido(codigo) {
  return CODIGOS.has(codigo);
}

function todosCodigos() {
  return MODULOS.map((m) => m.codigo);
}

module.exports = { MODULOS, CODIGOS, isCodigoValido, todosCodigos };
