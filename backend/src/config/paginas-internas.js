const PAGINAS_INTERNAS = [
  { path: '/inicio', label: 'Início' },
  { path: '/documentos', label: 'Documentos' },
  { path: '/ramais', label: 'Ramais' },
  { path: '/aniversariantes', label: 'Aniversariantes' },
  { path: '/treinamentos', label: 'Treinamentos' },
  { path: '/assinaturas', label: 'Assinaturas de E-mail' },
  { path: '/plaquinhas-camarote', label: 'Plaquinhas Camarote' },
  { path: '/ferramentas/pdf', label: 'Ferramentas de PDF' },
  { path: '/salas', label: 'Reservar sala' },
  { path: '/followup-suprimentos', label: 'Follow-up de Suprimentos' },
  { path: '/massagem', label: 'Massagem' },
  { path: '/pesquisas', label: 'Formulários' },
  { path: '/ti/rustdesk', label: 'TI / Rust Desk' },
  { path: '/nao-se-cale', label: 'Não se Cale' },
  { path: '/agenda_rh', label: 'Agenda RH' },
];

const DOCUMENTOS_PATH_REGEX = /^\/documentos(\/[a-z0-9-]+)?$/;
const TREINAMENTOS_PATH_REGEX = /^\/treinamentos(\/[a-z0-9-]+)?$/;
const PAGINA_PUBLICA_REGEX = /^\/p\/[a-z0-9-]+$/;

const PATHS = new Set(PAGINAS_INTERNAS.map((p) => p.path));

function isPaginaInterna(path) {
  return (
    PATHS.has(path) ||
    DOCUMENTOS_PATH_REGEX.test(path) ||
    TREINAMENTOS_PATH_REGEX.test(path) ||
    PAGINA_PUBLICA_REGEX.test(path) ||
    /^\/(agenda_rh|cipa)(\/evento\/[^/]+)?$/.test(path)
  );
}

module.exports = { PAGINAS_INTERNAS, isPaginaInterna };
