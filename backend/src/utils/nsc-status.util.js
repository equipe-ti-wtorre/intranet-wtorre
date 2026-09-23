const TZ = 'America/Sao_Paulo';
const LINK_RENOVACAO = 'https://forms.univesp.br/nao-se-cale/';
const LINK_PORTAL = 'https://www.mulher.sp.gov.br/sec_mulheres/nao_se_cale';
const LINK_CANAL = 'https://www.contatoseguro.com.br/naosecalewtorre';

function hojeIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function parseAntecedencias(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [30, 15, 7];
    }
  }
  if (!Array.isArray(arr)) return [30, 15, 7];
  const nums = arr.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? [...new Set(nums)].sort((a, b) => b - a) : [30, 15, 7];
}

function parseEmailsRh(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = String(raw)
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean);
}

function obrigatorioEfetivo(override, regraDepto) {
  if (override === 0 || override === false) return false;
  if (override === 1 || override === true) return true;
  return !!regraDepto;
}

function addMonthsIso(isoDate, meses) {
  const base = toIsoDate(isoDate);
  if (!base) return null;
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + Number(meses || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function validadeEfetiva(dataEmissao, validadeManual, mesesPadrao) {
  const manual = toIsoDate(validadeManual);
  if (manual) return manual;
  return addMonthsIso(dataEmissao, mesesPadrao || 12);
}

function diffDias(validadeIso, hoje = hojeIso()) {
  const v = toIsoDate(validadeIso);
  const h = toIsoDate(hoje) || hojeIso();
  if (!v) return null;
  const a = Date.parse(`${h}T00:00:00Z`);
  const b = Date.parse(`${v}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function calcularStatus({
  obrigatorio,
  dataEmissao,
  validadeManual,
  mesesPadrao,
  antecedencias,
  hoje = hojeIso(),
  aprovacaoPendente = false,
}) {
  const validade = validadeEfetiva(dataEmissao, validadeManual, mesesPadrao);
  const dias = validade ? diffDias(validade, hoje) : null;
  const ants = parseAntecedencias(antecedencias);
  const maior = ants.length ? Math.max(...ants) : 0;

  let status = 'nao_obrigatorio';
  if (aprovacaoPendente && !validade) {
    status = 'aguardando_aprovacao';
  } else if (!validade) {
    status = obrigatorio ? 'pendente' : 'nao_obrigatorio';
  } else if (dias < 0) {
    status = 'vencido';
  } else if (dias <= maior) {
    status = 'a_vencer';
  } else {
    status = 'valido';
  }

  const irregular = !!(
    obrigatorio &&
    (status === 'pendente' || status === 'vencido' || status === 'aguardando_aprovacao')
  );
  return {
    status,
    validade_efetiva: validade,
    dias_restantes: dias,
    irregular,
  };
}

function snapshotColaborador(colab, cert, regraObrigatorio, config, extra = {}) {
  const override = cert?.obrigatorio_override;
  const obrigatorio = obrigatorioEfetivo(override, regraObrigatorio);
  const pendente = extra.pendente || null;
  const calc = calcularStatus({
    obrigatorio,
    dataEmissao: cert?.data_emissao,
    validadeManual: cert?.validade_manual,
    mesesPadrao: config.meses_validade_padrao,
    antecedencias: config.antecedencias_aviso,
    aprovacaoPendente: !!pendente,
  });
  return {
    ad_object_id: colab.ad_id,
    nome: colab.nome,
    cargo: colab.cargo,
    departamento: colab.departamento,
    empresa: colab.empresa || null,
    email: colab.email,
    tenant_id: colab.tenant_id ?? null,
    obrigatorio_efetivo: obrigatorio,
    obrigatorio_override: override == null ? null : !!override,
    data_emissao: toIsoDate(cert?.data_emissao),
    validade_manual: toIsoDate(cert?.validade_manual),
    atualizado_em: cert?.atualizado_em || null,
    arquivo_id: cert?.arquivo_id ?? null,
    aprovacao_pendente: !!pendente,
    nome_lido_pendente: pendente?.nome_lido || null,
    ...calc,
  };
}

module.exports = {
  TZ,
  LINK_RENOVACAO,
  LINK_PORTAL,
  LINK_CANAL,
  hojeIso,
  toIsoDate,
  parseAntecedencias,
  parseEmailsRh,
  obrigatorioEfetivo,
  validadeEfetiva,
  addMonthsIso,
  diffDias,
  calcularStatus,
  snapshotColaborador,
};
