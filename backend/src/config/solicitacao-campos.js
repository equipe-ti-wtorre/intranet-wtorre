const CAMPOS = [
  { chave: 'solicitante', label: 'Solicitante', tipo: 'text', obrigatorio: true },
  { chave: 'solicitante_email', label: 'E-mail (solicitante)', tipo: 'email', obrigatorio: true },
  {
    chave: 'tipo',
    label: 'Tipo',
    tipo: 'enum',
    obrigatorio: true,
    opcoes: [
      { valor: 'novo', label: 'Novo colaborador' },
      { valor: 'reposicao', label: 'Reposição' },
      { valor: 'mudanca', label: 'Mudança' },
      { valor: 'efetivacao', label: 'Efetivação' },
    ],
  },
  { chave: 'nome', label: 'Nome', tipo: 'text', obrigatorio: true },
  { chave: 'sobrenome', label: 'Sobrenome', tipo: 'text', obrigatorio: true },
  { chave: 'email_novo', label: 'E-mail – Novo Colaborador', tipo: 'email', obrigatorio: false },
  { chave: 'data_nascimento', label: 'Data de nascimento', tipo: 'date', obrigatorio: false, sensivel: true },
  { chave: 'cpf', label: 'CPF', tipo: 'cpf', obrigatorio: false, sensivel: true },
  { chave: 'rg', label: 'RG', tipo: 'text', obrigatorio: false, sensivel: true },
  { chave: 'departamento', label: 'Departamento', tipo: 'text', obrigatorio: false },
  { chave: 'cargo', label: 'Cargo', tipo: 'text', obrigatorio: false },
  { chave: 'supervisor', label: 'Supervisor', tipo: 'text', obrigatorio: false },
  { chave: 'centro_custo', label: 'Centro de custo', tipo: 'text', obrigatorio: false },
  { chave: 'empresa', label: 'Empresa', tipo: 'text', obrigatorio: false },
  { chave: 'local_trabalho', label: 'Local de trabalho', tipo: 'text', obrigatorio: false },
  { chave: 'foto', label: 'Foto', tipo: 'file', obrigatorio: false, sensivel: true, anexo: true },
  { chave: 'boas_vindas', label: 'Mensagem de Boas-vindas', tipo: 'file', obrigatorio: false, anexo: true },
  { chave: 'precisa_ramal', label: 'Precisa de ramal?', tipo: 'bool', obrigatorio: false },
  { chave: 'precisa_celular', label: 'Precisa de celular?', tipo: 'bool', obrigatorio: false },
  {
    chave: 'equipamento',
    label: 'Equipamento',
    tipo: 'enum',
    obrigatorio: true,
    opcoes: [
      { valor: 'desktop', label: 'Desktop' },
      { valor: 'notebook', label: 'Notebook' },
      { valor: 'nao', label: 'Não' },
    ],
  },
  { chave: 'credencial_estacionamento', label: 'Credencial Estacionamento?', tipo: 'bool', obrigatorio: false },
  {
    chave: 'credencial_veiculo',
    label: 'Credencial do veículo',
    tipo: 'file',
    obrigatorio: false,
    anexo: true,
    condicional: { quando: 'credencial_estacionamento', valor: true },
  },
  { chave: 'data_inicio', label: 'Data de início', tipo: 'date', obrigatorio: false },
];

const CHAVES = new Set(CAMPOS.map((c) => c.chave));
const CHAVES_SENSIVEIS = new Set(CAMPOS.filter((c) => c.sensivel).map((c) => c.chave));
const CHAVES_ANEXO = new Set(CAMPOS.filter((c) => c.anexo).map((c) => c.chave));

function listarCampos() {
  return CAMPOS.map((c) => ({ ...c }));
}

function isChaveValida(chave) {
  return CHAVES.has(chave);
}

function getCampo(chave) {
  return CAMPOS.find((c) => c.chave === chave) || null;
}

module.exports = {
  CAMPOS,
  CHAVES,
  CHAVES_SENSIVEIS,
  CHAVES_ANEXO,
  listarCampos,
  isChaveValida,
  getCampo,
};
