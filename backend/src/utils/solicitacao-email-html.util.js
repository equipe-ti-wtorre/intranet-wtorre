const { getCampo } = require('../config/solicitacao-campos');
const { formatDateBr } = require('./parse-date.util');

/** Tokens WTorre para e-mail (compatível com clientes HTML) */
const C = {
  primary: '#1d54e6',
  primaryDark: '#1644c4',
  primaryLight: '#A8C4FF',
  bannerBg: '#E6F0FF',
  bannerBorder: '#C8D8F8',
  bannerText: '#0C2D7A',
  badgeTipoBg: '#E6F0FF',
  badgeTipoColor: '#1644c4',
  attachBg: '#F4F7FF',
  attachBorder: '#8BB0FF',
  attachText: '#1644c4',
  ink: '#1A1A1A',
  muted: '#999999',
  bodyBg: '#F0F0EE',
  footerBg: '#1A1A1A',
  simBg: '#E8F5E9',
  simColor: '#1B5E20',
  naoBg: '#F2F2F2',
  naoColor: '#666666',
  equipBg: '#EAF0FB',
  equipColor: '#1A4FA0',
};

const TIPO_LABELS = {
  novo: 'Novo colaborador',
  reposicao: 'Reposição',
  mudanca: 'Mudança',
  efetivacao: 'Efetivação',
};

const EQUIPAMENTO_LABELS = {
  desktop: 'Desktop',
  notebook: 'Notebook',
  nao: 'Não',
};

const EQUIPAMENTO_EMOJI = {
  desktop: '🖥',
  notebook: '💻',
  nao: '',
};

const ANEXO_EMOJI = {
  foto: '📷',
  boas_vindas: '🎉',
  credencial_veiculo: '🚗',
};

const ANEXO_LABELS = {
  foto: 'Foto',
  boas_vindas: 'Mensagem de boas-vindas',
  credencial_veiculo: 'Credencial do veículo',
};

const CAMPO_COL_MAP = {
  foto: 'foto_url',
  boas_vindas: 'boas_vindas_url',
  credencial_veiculo: 'credencial_veiculo_url',
};

const SECOES = [
  {
    titulo: 'Identificação',
    campos: ['nome', 'sobrenome', 'cpf', 'rg', 'data_nascimento', 'tipo'],
  },
  {
    titulo: 'Vínculo profissional',
    campos: [
      'empresa',
      'cargo',
      'departamento',
      'centro_custo',
      'supervisor',
      'local_trabalho',
      'email_novo',
      'solicitante',
      'solicitante_email',
    ],
  },
  {
    titulo: 'Recursos e acessos',
    campos: [
      'equipamento',
      'precisa_celular',
      'precisa_ramal',
      'credencial_estacionamento',
      'data_inicio',
    ],
  },
  {
    titulo: 'Anexos',
    campos: ['foto', 'boas_vindas', 'credencial_veiculo'],
    tipo: 'anexos',
  },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateShortBr(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const parts = s.split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${dias[date.getDay()]}, ${d} ${meses[m - 1]}`;
}

function formatValor(chave, solicitacao) {
  const campo = getCampo(chave);
  if (!campo) return '—';

  const col = CAMPO_COL_MAP[chave] || chave;
  const raw = solicitacao[col];

  if (campo.tipo === 'file') {
    return raw ? 'Anexo incluído neste e-mail' : '—';
  }
  if (campo.tipo === 'bool') {
    return raw ? 'Sim' : 'Não';
  }
  if (campo.tipo === 'date') {
    return formatDateShortBr(raw) || formatDateBr(raw);
  }
  if (chave === 'tipo') {
    return TIPO_LABELS[raw] || raw || '—';
  }
  if (chave === 'equipamento') {
    return EQUIPAMENTO_LABELS[raw] || raw || '—';
  }
  if (raw == null || raw === '') return '—';
  return String(raw);
}

function rawValor(chave, solicitacao) {
  const col = CAMPO_COL_MAP[chave] || chave;
  return solicitacao[col];
}

function fieldLabel(chave) {
  const campo = getCampo(chave);
  if (!campo) return chave;
  if (chave === 'tipo') return 'Tipo de solicitação';
  if (chave === 'email_novo') return 'E-mail';
  return campo.label;
}

function renderLabel(text) {
  return `<p style="margin:0 0 2px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.muted};">${escapeHtml(text)}</p>`;
}

function renderBadgeSimNao(valor) {
  const sim = valor === 'Sim';
  const bg = sim ? C.simBg : C.naoBg;
  const color = sim ? C.simColor : C.naoColor;
  const prefix = sim ? '&#10003; ' : '';
  return `<span style="display:inline-block;background-color:${bg};color:${color};font-family:Arial,sans-serif;font-size:12px;font-weight:700;padding:3px 10px;border-radius:4px;">${prefix}${escapeHtml(valor)}</span>`;
}

function renderValorHtml(chave, solicitacao) {
  const campo = getCampo(chave);
  if (!campo) {
    return `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:${C.muted};">—</p>`;
  }

  const valor = formatValor(chave, solicitacao);
  const raw = rawValor(chave, solicitacao);

  if (chave === 'tipo') {
    return `<p style="margin:0;"><span style="display:inline-block;background-color:${C.badgeTipoBg};color:${C.badgeTipoColor};font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">${escapeHtml(valor)}</span></p>`;
  }

  if (chave === 'equipamento' && raw && raw !== 'nao') {
    const emoji = EQUIPAMENTO_EMOJI[raw] || '';
    return `<p style="margin:0;"><span style="display:inline-block;background-color:${C.equipBg};color:${C.equipColor};font-family:Arial,sans-serif;font-size:12px;font-weight:700;padding:3px 10px;border-radius:4px;">${emoji ? `${emoji} ` : ''}${escapeHtml(valor)}</span></p>`;
  }

  if (campo.tipo === 'bool') {
    return `<p style="margin:0;">${renderBadgeSimNao(valor)}</p>`;
  }

  if (chave === 'email_novo' && raw) {
    return `<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:${C.primary};">${escapeHtml(valor)}</p>`;
  }

  if (chave === 'cpf' || chave === 'rg') {
    return `<p style="margin:0;font-family:'Courier New',monospace;font-size:14px;color:${C.ink};">${escapeHtml(valor)}</p>`;
  }

  if (chave === 'data_inicio' && raw) {
    return `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:${C.ink};">${escapeHtml(valor)}</p>`;
  }

  const color = valor === '—' ? C.muted : C.ink;
  return `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:${color};">${escapeHtml(valor)}</p>`;
}

function renderFieldRows(camposVisiveis, solicitacao) {
  const rows = [];
  for (let i = 0; i < camposVisiveis.length; i += 2) {
    const left = camposVisiveis[i];
    const right = camposVisiveis[i + 1];
    const isLast = i + 2 >= camposVisiveis.length;
    const padBottom = isLast && !right ? '0' : '12px';
    const leftPad = `0 8px ${right ? '12px' : padBottom} 0`;
    const rightPad = `0 0 ${padBottom} 8px`;

    let row = '<tr>';
    row += `<td width="50%" style="padding:${leftPad};vertical-align:top;">
      ${renderLabel(fieldLabel(left))}
      ${renderValorHtml(left, solicitacao)}
    </td>`;
    if (right) {
      row += `<td width="50%" style="padding:${rightPad};vertical-align:top;">
        ${renderLabel(fieldLabel(right))}
        ${renderValorHtml(right, solicitacao)}
      </td>`;
    } else {
      row += '<td width="50%" style="padding:0;"></td>';
    }
    row += '</tr>';
    rows.push(row);
  }
  return rows.join('');
}

function renderAnexoCard(chave, solicitacao, side = 'left') {
  const col = CAMPO_COL_MAP[chave] || chave;
  const temAnexo = Boolean(solicitacao[col]);
  const emoji = ANEXO_EMOJI[chave] || '📎';
  const label = ANEXO_LABELS[chave] || fieldLabel(chave);
  const status = temAnexo ? 'Anexo incluído neste e-mail' : 'Não enviado';
  const pad = side === 'right' ? '0 0 0 8px' : '0 8px 0 0';

  return `<td width="50%" style="padding:${pad};vertical-align:top;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.attachBg};border:1px dashed ${C.attachBorder};border-radius:6px;">
      <tr>
        <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:13px;color:${C.attachText};">
          ${emoji} <strong>${escapeHtml(label)}</strong><br>
          <span style="font-size:11px;color:${C.muted};">${escapeHtml(status)}</span>
        </td>
      </tr>
    </table>
  </td>`;
}

function renderAnexoRows(camposVisiveis, solicitacao) {
  const rows = [];
  for (let i = 0; i < camposVisiveis.length; i += 2) {
    const left = camposVisiveis[i];
    const right = camposVisiveis[i + 1];
    let row = '<tr>';
    row += renderAnexoCard(left, solicitacao, 'left');
    if (right) {
      row += renderAnexoCard(right, solicitacao, 'right');
    } else {
      row += '<td width="50%" style="padding:0;"></td>';
    }
    row += '</tr>';
    rows.push(row);
  }
  return rows.join('');
}

function renderSecao(titulo, conteudo) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
    <tr>
      <td style="padding-bottom:10px;border-bottom:2px solid ${C.primary};">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.primary};">${escapeHtml(titulo)}</p>
      </td>
    </tr>
    <tr><td style="padding-top:12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${conteudo}
      </table>
    </td></tr>
  </table>`;
}

function buildBannerHtml(solicitacao, camposSet) {
  const nomeCompleto = escapeHtml(`${solicitacao.nome} ${solicitacao.sobrenome}`.trim());
  const tipoLabel = escapeHtml(TIPO_LABELS[solicitacao.tipo] || solicitacao.tipo || '—');

  let inicioHtml = '';
  if (camposSet.has('data_inicio') && solicitacao.data_inicio) {
    const inicio = escapeHtml(formatDateShortBr(solicitacao.data_inicio) || formatDateBr(solicitacao.data_inicio));
    inicioHtml = `<td align="right" style="font-family:Arial,sans-serif;font-size:12px;color:${C.primary};white-space:nowrap;">
      Início: <strong>${inicio}</strong>
    </td>`;
  } else {
    inicioHtml = '<td></td>';
  }

  return `<tr>
    <td style="background-color:${C.bannerBg};padding:12px 28px;border-bottom:1px solid ${C.bannerBorder};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:Arial,sans-serif;font-size:13px;color:${C.bannerText};">
            Solicitação para <strong>${nomeCompleto}</strong> (${tipoLabel})
          </td>
          ${inicioHtml}
        </tr>
      </table>
    </td>
  </tr>`;
}

function buildSecoesHtml(solicitacao, campos) {
  const camposSet = new Set(campos);
  const partes = [];

  for (const secao of SECOES) {
    const visiveis = secao.campos.filter((chave) => camposSet.has(chave));
    if (!visiveis.length) continue;

    if (secao.tipo === 'anexos') {
      partes.push(renderSecao(secao.titulo, renderAnexoRows(visiveis, solicitacao)));
    } else {
      partes.push(renderSecao(secao.titulo, renderFieldRows(visiveis, solicitacao)));
    }
  }

  const cobertos = new Set(SECOES.flatMap((s) => s.campos));
  const extras = campos.filter((chave) => !cobertos.has(chave));
  if (extras.length) {
    partes.push(renderSecao('Informações adicionais', renderFieldRows(extras, solicitacao)));
  }

  return partes.join('');
}

function buildGrupoHtml(solicitacao, campos) {
  const camposSet = new Set(campos);
  const secoesHtml = buildSecoesHtml(solicitacao, campos);
  const bannerHtml = buildBannerHtml(solicitacao, camposSet);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Nova Solicitação de Colaborador – Intranet WTorre</title>
<!--[if mso]>
<noscript>
<xml>
  <o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style type="text/css">
  body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; display: block; }
  body { margin: 0; padding: 0; background-color: ${C.bodyBg}; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bodyBg};font-family:Arial,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bodyBg};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <tr>
          <td style="background-color:${C.primary};padding:0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="6" style="background-color:${C.primaryDark};">&nbsp;</td>
                <td style="padding:20px 28px;">
                  <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.primaryLight};">GRUPO WTORRE &middot; INTRANET</p>
                  <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;line-height:1.2;">Nova solicitação de colaborador</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${bannerHtml}

        <tr>
          <td style="padding:28px 28px 8px;">
            ${secoesHtml}
          </td>
        </tr>

        <tr>
          <td style="background-color:${C.footerBg};padding:16px 28px;border-radius:0 0 8px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,sans-serif;font-size:11px;color:#888888;line-height:1.5;">
                  &#128274;&nbsp; Mensagem automática da Intranet WTorre. Não compartilhe dados pessoais fora dos canais autorizados.
                </td>
                <td align="right" style="white-space:nowrap;">
                  <span style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1px;color:#555555;text-transform:uppercase;">GRUPO WTORRE</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

function buildTextoPlano(solicitacao, campos) {
  const linhas = campos.map((chave) => {
    const campo = getCampo(chave);
    if (!campo) return null;
    return `${fieldLabel(chave)}: ${formatValor(chave, solicitacao)}`;
  }).filter(Boolean);
  return ['Nova solicitação de colaborador', '', ...linhas].join('\n');
}

module.exports = {
  escapeHtml,
  buildGrupoHtml,
  buildTextoPlano,
  formatValor,
  CAMPO_COL_MAP,
};
