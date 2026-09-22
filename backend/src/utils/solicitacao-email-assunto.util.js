const ASSUNTO_PADRAO = 'Nova solicitação de colaborador — {nome} ({tipo})';

const TIPO_LABELS = {
  novo: 'Novo',
  reposicao: 'Reposição',
  mudanca: 'Mudança',
  efetivacao: 'Efetivação',
};

function formatData(value) {
  if (!value) return '';
  const s = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function buildPlaceholderMap(solicitacao) {
  const tipoLabel = TIPO_LABELS[solicitacao?.tipo] || solicitacao?.tipo || '';
  return {
    nome: solicitacao?.nome || '',
    sobrenome: solicitacao?.sobrenome || '',
    tipo: tipoLabel,
    departamento: solicitacao?.departamento || '',
    cargo: solicitacao?.cargo || '',
    empresa: solicitacao?.empresa || '',
    solicitante: solicitacao?.solicitante_nome || '',
    data_inicio: formatData(solicitacao?.data_inicio),
  };
}

function applyPlaceholders(template, map) {
  return String(template || '').replace(/\{([a-z_]+)\}/gi, (full, key) => {
    const k = String(key).toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, k) ? String(map[k] ?? '') : full;
  });
}

function buildAssunto(template, solicitacao) {
  const tpl = String(template || '').trim() || ASSUNTO_PADRAO;
  const subject = applyPlaceholders(tpl, buildPlaceholderMap(solicitacao)).replace(/<[^>]+>/g, '');
  return subject.slice(0, 255);
}

function validarAssunto(assunto) {
  if (assunto == null || assunto === '') return null;
  const s = String(assunto).trim();
  if (!s) return null;
  if (s.length > 255) {
    const err = new Error('Assunto do e-mail deve ter no máximo 255 caracteres.');
    err.status = 400;
    throw err;
  }
  return s;
}

module.exports = {
  ASSUNTO_PADRAO,
  TIPO_LABELS,
  buildAssunto,
  validarAssunto,
  buildPlaceholderMap,
  applyPlaceholders,
};
