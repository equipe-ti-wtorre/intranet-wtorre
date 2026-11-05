const TZ = 'America/Sao_Paulo';

function normHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function isPerguntaIdentidade(texto) {
  return ['cpf', 'cnpj', 'cpf cnpj', 'email', 'e mail', 'rg'].includes(normHeader(texto));
}

function temPerguntaIdentidade(perguntas) {
  return (perguntas || []).some(
    (p) => (!p.blocoTipo || p.blocoTipo === 'pergunta') && isPerguntaIdentidade(p.texto)
  );
}

function perguntasExportaveis(perguntas) {
  return (perguntas || []).filter((p) => p.blocoTipo !== 'texto');
}

function titulosColunasPerguntas(perguntas) {
  const seen = new Map();
  return perguntasExportaveis(perguntas).map((q) => {
    const base = (q.texto || 'Pergunta').trim() || 'Pergunta';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function incluirIdentidadeCadastro(form, perguntas) {
  if (form?.anonimo) return false;
  if (temPerguntaIdentidade(perguntas)) return false;
  if (form?.publicoAlvo === 'externos') return !!form.exigirIdentidade;
  return true;
}

function colunasIdentidade(form) {
  if (form?.publicoAlvo === 'externos') return ['Nome', 'E-mail', 'CPF/CNPJ', 'RG'];
  return ['Nome', 'E-mail'];
}

function incluirCobertura(form) {
  if (form?.anonimo) return false;
  if (form?.publicoAlvo === 'externos') return !!form.exigirIdentidade;
  return true;
}

function formatarDataHora(iso) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

function anexoMetaValido(item) {
  return !!(item && item.nome && item.container && item.blob);
}

function parseAnexosLista(valor) {
  if (!valor) return [];
  let parsed = valor;
  if (typeof valor === 'string') {
    try {
      parsed = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) return parsed.filter(anexoMetaValido);
  if (anexoMetaValido(parsed)) return [parsed];
  return [];
}

function rotuloAnexoValor(valor) {
  const lista = parseAnexosLista(valor);
  if (lista.length) return lista.map((item) => item.nome).join('; ');
  return valor == null ? '' : String(valor);
}

function valorCelula(pergunta, valor) {
  if (!pergunta) return valor == null ? '' : String(valor);
  if (pergunta.blocoTipo === 'anexo') return rotuloAnexoValor(valor);
  if (valor == null || valor === '') return '';
  return String(valor);
}

function celulaOuVazio(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || s === '—') return '';
  return s;
}

function valoresPorPergunta(resposta) {
  const map = new Map();
  for (const item of resposta?.itens || []) {
    const id = item.perguntaId;
    if (id == null) continue;
    const atual = map.get(id);
    const proximo = item.valor;
    if (atual == null || atual === '') map.set(id, proximo);
    else if (proximo != null && proximo !== '') map.set(id, `${atual}; ${proximo}`);
    else map.set(id, atual);
  }
  return map;
}

function identidadeDaResposta(form, resposta) {
  if (form?.publicoAlvo === 'externos') {
    if (!resposta?.convidadoId) return ['', '', '', ''];
    return [
      celulaOuVazio(resposta.nome === 'Convidado' ? '' : resposta.nome),
      celulaOuVazio(resposta.email),
      celulaOuVazio(resposta.cpfMascara),
      celulaOuVazio(resposta.rgMascara),
    ];
  }
  if (!resposta?.usuarioId) return ['', ''];
  return [celulaOuVazio(resposta.nome), celulaOuVazio(resposta.email)];
}

function cabecalhoRespostas(form, perguntas) {
  const base = ['Data/hora', '#'];
  if (incluirIdentidadeCadastro(form, perguntas)) {
    base.push(...colunasIdentidade(form));
  }
  base.push(...titulosColunasPerguntas(perguntas));
  return base;
}

function linhaResposta(form, perguntas, resposta, indice) {
  const cols = [formatarDataHora(resposta?.enviadoEm), String(indice)];
  if (incluirIdentidadeCadastro(form, perguntas)) {
    cols.push(...identidadeDaResposta(form, resposta));
  }
  const porPergunta = valoresPorPergunta(resposta);
  for (const q of perguntasExportaveis(perguntas)) {
    cols.push(valorCelula(q, q.id != null ? porPergunta.get(q.id) : ''));
  }
  return cols;
}

function montarAbaRespostas(form, perguntas, respostas) {
  const ordenados = [...(respostas || [])].sort((a, b) => {
    const ta = a.enviadoEm || '';
    const tb = b.enviadoEm || '';
    return ta.localeCompare(tb) || (a.id || 0) - (b.id || 0);
  });
  const rows = [cabecalhoRespostas(form, perguntas)];
  ordenados.forEach((r, i) => {
    rows.push(linhaResposta(form, perguntas, r, i + 1));
  });
  return rows;
}

function ultimaRespostaPorChave(respostas, chaveFn) {
  const map = new Map();
  for (const r of respostas || []) {
    const key = chaveFn(r);
    if (key == null) continue;
    const atual = map.get(key);
    if (!atual || (r.enviadoEm || '') > (atual.enviadoEm || '')) map.set(key, r);
  }
  return map;
}

function montarAbaCobertura(form, publico, respostas) {
  if (!incluirCobertura(form)) return null;
  const externo = form?.publicoAlvo === 'externos';
  const header = [...colunasIdentidade(form), 'Respondido', 'Data/hora'];
  const rows = [header];
  const porConvidado = ultimaRespostaPorChave(respostas, (r) => r.convidadoId || null);
  const porUsuario = ultimaRespostaPorChave(respostas, (r) => r.usuarioId || null);

  for (const pessoa of publico || []) {
    const hit = externo
      ? porConvidado.get(pessoa.id)
      : porUsuario.get(pessoa.usuarioId || pessoa.id);
    const identidade = externo
      ? [
          celulaOuVazio(pessoa.nome),
          celulaOuVazio(pessoa.email),
          celulaOuVazio(pessoa.cpfMascara),
          celulaOuVazio(pessoa.rgMascara),
        ]
      : [celulaOuVazio(pessoa.nome), celulaOuVazio(pessoa.email)];
    rows.push([
      ...identidade,
      hit ? 'Sim' : 'Não',
      hit ? formatarDataHora(hit.enviadoEm) : '',
    ]);
  }
  return rows;
}

function nomeArquivoExport(titulo) {
  const base =
    String(titulo || 'formulario')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'formulario';
  return `${base}-respostas.xlsx`;
}

module.exports = {
  isPerguntaIdentidade,
  temPerguntaIdentidade,
  incluirIdentidadeCadastro,
  incluirCobertura,
  colunasIdentidade,
  formatarDataHora,
  rotuloAnexoValor,
  valorCelula,
  cabecalhoRespostas,
  linhaResposta,
  montarAbaRespostas,
  montarAbaCobertura,
  nomeArquivoExport,
};
