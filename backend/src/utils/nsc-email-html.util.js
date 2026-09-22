const { LINK_RENOVACAO, LINK_PORTAL } = require('./nsc-status.util');

const C = {
  wtorre: '#1d54e6',
  ink: '#10151f',
  soft: '#48536a',
  bg: '#f4f5f8',
};

function wrap(inner) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${C.bg};font-family:'Segoe UI',Arial,sans-serif;color:${C.ink};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:${C.wtorre};color:#fff;padding:18px 24px;font-weight:700;font-size:16px;">
              Protocolo Não se Cale · Grupo WTorre
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">${inner}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function statusLabel(status) {
  const map = {
    pendente: 'Pendente',
    a_vencer: 'A vencer',
    vencido: 'Vencido',
    valido: 'Válido',
    aguardando_aprovacao: 'Aguardando aprovação',
  };
  return map[status] || status;
}

function colaboradorHtml({ nome, status, validade, dias }) {
  const atraso = dias != null && dias < 0 ? Math.abs(dias) : null;
  const prazo =
    dias == null
      ? ''
      : dias < 0
        ? `há ${atraso} dia(s)`
        : `em ${dias} dia(s)`;
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;">Olá, ${nome || 'colaborador'}.</p>
    <p style="margin:0 0 12px;color:${C.soft};line-height:1.5;">
      Seu certificado do Protocolo Não se Cale está <strong>${statusLabel(status)}</strong>
      ${validade ? ` (validade ${validade}${prazo ? `, ${prazo}` : ''})` : ''}.
    </p>
    <p style="margin:0 0 16px;color:${C.soft};line-height:1.5;">
      A capacitação é gratuita e online, exigida pelas Leis 17.621/2023 e 17.635/2023
      e pelo decreto 67.856/2023. Só vale o certificado oficial da Secretaria de Políticas
      para a Mulher / Univesp.
    </p>
    <p style="margin:0 0 8px;">
      <a href="${LINK_RENOVACAO}" style="display:inline-block;background:${C.wtorre};color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;">
        Emitir / renovar certificado
      </a>
    </p>
    <p style="margin:16px 0 0;font-size:13px;">
      <a href="${LINK_PORTAL}" style="color:${C.wtorre};">Portal informativo</a>
    </p>`;
  return wrap(inner);
}

function gestorHtml({ gestorNome, colaboradorNome, status, validade }) {
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;">Olá${gestorNome ? `, ${gestorNome}` : ''}.</p>
    <p style="margin:0 0 12px;color:${C.soft};line-height:1.5;">
      O colaborador <strong>${colaboradorNome}</strong> está com o certificado
      Não se Cale <strong>${statusLabel(status)}</strong>
      ${validade ? ` (validade ${validade})` : ''}.
    </p>
    <p style="margin:0;color:${C.soft};line-height:1.5;">
      Quem atua em eventos (Nubank Parque / WTorre Entretenimento) precisa do certificado
      oficial em dia. Peça a renovação em
      <a href="${LINK_RENOVACAO}" style="color:${C.wtorre};">${LINK_RENOVACAO}</a>.
    </p>`;
  return wrap(inner);
}

function resumoRhHtml({ kpis, destaques }) {
  const linhas = (destaques || [])
    .slice(0, 40)
    .map(
      (c) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e4e8f0;">${c.nome || '—'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e4e8f0;">${c.departamento || '—'}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e4e8f0;">${statusLabel(c.status)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e4e8f0;">${c.validade_efetiva || '—'}</td>
        </tr>`
    )
    .join('');
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;">Resumo semanal — Não se Cale</p>
    <p style="margin:0 0 16px;color:${C.soft};">
      Obrigatórios: <strong>${kpis.obrigatorios}</strong> ·
      Válidos: <strong>${kpis.validos}</strong> ·
      A vencer: <strong>${kpis.a_vencer}</strong> ·
      Vencidos: <strong>${kpis.vencidos}</strong> ·
      Pendentes: <strong>${kpis.pendentes}</strong>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
      <tr style="background:#f6f8fc;color:${C.soft};text-align:left;">
        <th style="padding:6px 8px;">Colaborador</th>
        <th style="padding:6px 8px;">Departamento</th>
        <th style="padding:6px 8px;">Status</th>
        <th style="padding:6px 8px;">Validade</th>
      </tr>
      ${linhas || '<tr><td colspan="4" style="padding:12px 8px;">Nenhuma pendência.</td></tr>'}
    </table>`;
  return wrap(inner);
}

function aprovacaoRhHtml({ colaboradorNome, nomeLido, dataEmissao, motivo }) {
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;">Aprovação pendente</p>
    <p style="margin:0 0 12px;color:${C.soft};line-height:1.5;">
      O colaborador <strong>${colaboradorNome || '—'}</strong> enviou um certificado
      em nome de <strong>${nomeLido || '—'}</strong>
      ${dataEmissao ? ` (emissão ${dataEmissao})` : ''}.
    </p>
    ${
      motivo
        ? `<p style="margin:0 0 12px;color:${C.soft};line-height:1.5;">Motivo informado: <strong>${String(motivo)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')}</strong></p>`
        : ''
    }
    <p style="margin:0 0 12px;color:${C.soft};line-height:1.5;">
      Confira o arquivo e aprove ou recuse na aba <strong>Aprovações</strong>
      do módulo Não se Cale.
    </p>`;
  return wrap(inner);
}

function textoPlano(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  colaboradorHtml,
  gestorHtml,
  resumoRhHtml,
  aprovacaoRhHtml,
  textoPlano,
  statusLabel,
};
