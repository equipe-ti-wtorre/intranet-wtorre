const BLOB_BASE = 'https://nubankparqueassets.blob.core.windows.net/email-assets';

/** Domínios que não devem gerar assinatura (ex.: alias padrão do tenant M365). */
const DOMINIOS_EXCLUIDOS = new Set(['wtorre.onmicrosoft.com', 'allianzparque.com.br']);

const DOMINIOS = {
  'nubankparque.com': {
    cor: '#8D0DE3',
    entidade: 'Nubank Parque',
    banner: `${BLOB_BASE}/banner_nubank_parque.gif`,
    font: "'NuSansDisplay',Helvetica,Arial,sans-serif",
    wNome: '500',
    wResto: '400',
    fontFace: true,
  },
  'basecoworking.space': {
    cor: '#005399',
    entidade: 'Base Coworking',
    banner: `${BLOB_BASE}/banner_base_coworking.gif`,
    font: 'Helvetica,Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
  'novoanhangabau.com.br': {
    cor: '#000000',
    entidade: 'Novo Anhangabaú',
    banner: `${BLOB_BASE}/banner_novoanhangabau.gif`,
    font: 'Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
  'wtentretenimento.com.br': {
    cor: '#005399',
    entidade: 'Real Arenas',
    banner: `${BLOB_BASE}/banner_allianz_parque.gif`,
    font: 'Helvetica,Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
  'wtorre.com.br': {
    cor: '#005399',
    entidade: 'WTorre',
    banner: `${BLOB_BASE}/banner_wtorre.gif`,
    font: 'Helvetica,Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
};

/** Legado: alguns aliases ainda usam o sufixo .com.br. */
const DOMINIO_ALIASES = {
  'nubankparque.com.br': 'nubankparque.com',
};

function extrairDominio(email) {
  if (!email || typeof email !== 'string') return null;
  const idx = email.lastIndexOf('@');
  if (idx < 0) return null;
  return email.slice(idx + 1).toLowerCase();
}

function normalizarDominio(dominio) {
  return DOMINIO_ALIASES[dominio] ?? dominio;
}

function resolverDominio(email) {
  const bruto = extrairDominio(email);
  if (!bruto) return null;
  const dominio = normalizarDominio(bruto);
  return DOMINIOS[dominio] ? { dominio, ...DOMINIOS[dominio] } : null;
}

function isDominioMapeado(email) {
  const bruto = extrairDominio(email);
  if (!bruto) return false;
  return Object.prototype.hasOwnProperty.call(DOMINIOS, normalizarDominio(bruto));
}

function resolverDominioPorChave(dominio) {
  const key = normalizarDominio(String(dominio).toLowerCase());
  return DOMINIOS[key] ? { dominio: key, ...DOMINIOS[key] } : null;
}

function isDominioExcluido(email) {
  const dominio = extrairDominio(email);
  if (!dominio) return false;
  if (DOMINIOS_EXCLUIDOS.has(dominio)) return true;
  // Qualquer alias *.onmicrosoft.com é domínio interno do tenant M365
  return dominio.endsWith('.onmicrosoft.com');
}

function isEmailPermitido(email) {
  return !isDominioExcluido(email);
}

module.exports = {
  BLOB_BASE,
  DOMINIOS,
  DOMINIOS_EXCLUIDOS,
  DOMINIO_ALIASES,
  extrairDominio,
  normalizarDominio,
  resolverDominio,
  resolverDominioPorChave,
  isDominioMapeado,
  isDominioExcluido,
  isEmailPermitido,
};
