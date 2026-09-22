const { hojeIso: hojeIsoSp } = require('./nsc-status.util');

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di']);

function stripAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function includesPhrase(normalized, phrase) {
  if (!normalized) return false;
  const nPhrase = normalizeText(phrase);
  if (normalized.includes(nPhrase)) return true;
  if (compactText(normalized).includes(compactText(nPhrase))) return true;
  const re = new RegExp(nPhrase.split(/\s+/).join('\\s*') + 'e?', 'i');
  return re.test(normalized);
}

function temMarcadoresOficiais(text) {
  const n = normalizeText(text);
  if (!n.includes('certificado') && !n.includes('certificamos')) return false;
  if (!includesPhrase(n, 'nao se cale') && !n.includes('naosecale')) return false;
  const temLei =
    n.includes('17.621') ||
    n.includes('17621') ||
    n.includes('17.635') ||
    n.includes('17635');
  if (!temLei) return false;
  return (
    n.includes('univesp') ||
    n.includes('secretaria') ||
    n.includes('procon') ||
    n.includes('mulher.sp.gov') ||
    n.includes('mulhersp') ||
    n.includes('governo do estado')
  );
}

function limparNome(raw) {
  let nome = String(raw || '')
    .replace(/[_.=•·\-–—;:,]+/g, ' ')
    .replace(/[0-9].*$/g, ' ')
    .replace(/[^A-Za-zÀ-ÿ\s'.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  nome = nome.replace(/^(que|o|a)\s+/i, '').trim();
  if (nome.length < 3 || nome.length > 90) return null;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(nome)) return null;
  return nome;
}

function extractNomeCabecalho(text) {
  const before = String(text || '').split(/data\s*de\s*emiss/i)[0];
  const compact = before.replace(/\s+/g, ' ').trim();
  if (!compact || compact.length > 90) return null;
  if (/certificamos|protocolo|curso de/i.test(compact)) return null;
  return limparNome(compact);
}

function nomeParecePessoa(nome) {
  if (!nome) return null;
  if (/concluiu|certificamos|protocolo|curso|capacitac|nao se cale|univesp|procon/i.test(nome)) {
    return null;
  }
  return nome;
}

function extractNome(text) {
  const raw = String(text || '').replace(/\s+/g, ' ');
  const padroes = [
    /certificamos\s*que[,.\s:_-]*(.+?)[,.\s]*concluiu/i,
    /certificamosque[,.\s:_-]*(.+?)[,.\s]*concluiu/i,
    /certificamos\s*que[,.\s:_-]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{2,80})/i,
  ];
  for (const re of padroes) {
    const m = raw.match(re);
    if (!m) continue;
    const nome = nomeParecePessoa(limparNome(m[1]));
    if (nome) return nome;
  }
  return extractNomeCabecalho(text);
}

function toIsoDateParts(dia, mes, ano) {
  const d = Number(dia);
  const m = Number(mes);
  let y = Number(ano);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (y < 100) {
    if (y < 20) return null;
    y += 2000;
  }
  if (y < 2020 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const MESES_ABREV = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

const RE_DATA_NUM = /(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/;
const RE_DATA_ESPACO = /(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})/;
const RE_ROTULO =
  /(?:data\s*d[ae]\s*em[il1]?ss\w*|emitid[oa]\s+em)[:\s.]*/i;
const RE_DATA_EXTENSO =
  /(\d{1,2})\s+(?:de\s+)?([a-z]{3,9})\s+(?:de\s+)?(\d{2,4})/i;

function matchDataNumerica(chunk) {
  const colado = String(chunk || '').match(
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\d{0,4}/
  );
  if (colado) return toIsoDateParts(colado[1], colado[2], colado[3]);
  const sep = String(chunk || '').match(RE_DATA_NUM);
  if (sep) return toIsoDateParts(sep[1], sep[2], sep[3]);
  const espaco = String(chunk || '').match(RE_DATA_ESPACO);
  if (espaco) return toIsoDateParts(espaco[1], espaco[2], espaco[3]);
  return null;
}

function mesDeNome(nome) {
  return MESES_ABREV[String(nome || '').slice(0, 3)] || null;
}

function extractDataExtenso(text) {
  const n = normalizeText(text);
  const m = n.match(RE_DATA_EXTENSO);
  if (!m) return null;
  const mes = mesDeNome(m[2]);
  if (!mes) return null;
  return toIsoDateParts(m[1], mes, m[3]);
}

function extractDataEmissao(text) {
  const raw = String(text || '').replace(/\s+/g, ' ');
  const rotulo = raw.match(RE_ROTULO);
  if (rotulo) {
    const apos = raw.slice(rotulo.index + rotulo[0].length).slice(0, 40);
    const doRotulo = matchDataNumerica(apos) || extractDataExtenso(apos);
    if (doRotulo) return doRotulo;
  }

  const extenso = extractDataExtenso(raw);
  if (extenso) return extenso;

  return matchDataNumerica(raw);
}

function isDataFutura(iso, hoje = hojeIsoSp()) {
  return !!iso && iso > hoje;
}

function tokenizeName(value) {
  return normalizeText(value)
    .split(' ')
    .map((t) => t.replace(/[^a-z]/g, ''))
    .filter((t) => t.length >= 2 && !PARTICULAS.has(t));
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[s.length][t.length];
}

function tokensIguais(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const dist = levenshtein(a, b);
  if (dist <= 1) return true;
  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  if (minLen / maxLen < 0.8) return false;
  return dist <= Math.ceil(maxLen * 0.2);
}

function contarTokensEmComum(nomeLido, nomeColaborador) {
  const lido = tokenizeName(nomeLido);
  const colab = tokenizeName(nomeColaborador);
  const usados = new Set();
  let n = 0;
  for (const token of colab) {
    const idx = lido.findIndex((u, i) => !usados.has(i) && tokensIguais(token, u));
    if (idx < 0) continue;
    usados.add(idx);
    n += 1;
  }
  return n;
}

function nomeTemAlgumTokenDoAd(nomeLido, nomeColaborador) {
  return contarTokensEmComum(nomeLido, nomeColaborador) > 0;
}

function nomeConfere(nomeLido, nomeColaborador) {
  const lido = tokenizeName(nomeLido);
  const colab = tokenizeName(nomeColaborador);
  if (lido.length < 2 || colab.length < 2) return false;
  return contarTokensEmComum(nomeLido, nomeColaborador) === colab.length;
}

function validarTextoCertificado(text, nomeColaborador, opts = {}) {
  const hoje = opts.hojeIso || hojeIsoSp();
  if (!temMarcadoresOficiais(text)) {
    return {
      ok: false,
      erro: 'Este arquivo não é o certificado oficial do Protocolo Não se Cale.',
    };
  }

  const nome = extractNome(text);
  if (!nome) {
    return { ok: false, erro: 'Não foi possível ler o nome no certificado.' };
  }

  const dataEmissao = extractDataEmissao(text);
  if (!dataEmissao) {
    return {
      ok: false,
      nome,
      nome_confere: nomeConfere(nome, nomeColaborador),
      erro: 'Não foi possível ler a data de emissão no certificado.',
    };
  }
  if (isDataFutura(dataEmissao, hoje)) {
    return {
      ok: false,
      nome,
      data_emissao: dataEmissao,
      erro: 'A data de emissão do certificado é futura.',
    };
  }

  if (!nomeTemAlgumTokenDoAd(nome, nomeColaborador)) {
    return {
      ok: false,
      nome,
      data_emissao: dataEmissao,
      erro: 'O nome no certificado não coincide com o seu. Envie o certificado oficial no seu nome.',
    };
  }

  return {
    ok: true,
    nome,
    data_emissao: dataEmissao,
    nome_confere: nomeConfere(nome, nomeColaborador),
  };
}

module.exports = {
  stripAccents,
  normalizeText,
  temMarcadoresOficiais,
  extractNome,
  extractDataEmissao,
  isDataFutura,
  tokenizeName,
  levenshtein,
  tokensIguais,
  nomeConfere,
  nomeTemAlgumTokenDoAd,
  validarTextoCertificado,
};
