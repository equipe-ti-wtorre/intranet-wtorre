import { AssinaturaPayload } from '../models/assinatura.model';
import { FONTE_NUSANS_MEDIUM, FONTE_NUSANS_REGULAR, resolverDominio, resolverDominioPorChave } from './assinatura-domains';

function telHref(value: string): string {
  return value.replace(/\s/g, '');
}

function buildIconSpan(cor: string, entity: string): string {
  return `<span style="font-family:Arial,Helvetica,sans-serif;color:${cor}">${entity}&#xFE0E;</span>`;
}

function buildFontFace(): string {
  return `<style>
  @font-face { font-family:'NuSansDisplay'; font-weight:500; font-style:normal; src:url('${FONTE_NUSANS_MEDIUM}') format('opentype'); }
  @font-face { font-family:'NuSansDisplay'; font-weight:400; font-style:normal; src:url('${FONTE_NUSANS_REGULAR}') format('opentype'); }
</style>`;
}

function resolverConfig(sig: AssinaturaPayload) {
  if (sig.dominioEstilo) {
    return resolverDominioPorChave(sig.dominioEstilo);
  }
  return resolverDominio(sig.email);
}

const OWA_FONT_FALLBACK = 'Helvetica,Arial,sans-serif';

function resolveFontForOwa(font: string, wNome: string, wResto: string): { font: string; wNome: string; wResto: string } {
  if (font.includes('NuSansDisplay')) {
    return { font: OWA_FONT_FALLBACK, wNome: 'bold', wResto: 'normal' };
  }
  return { font, wNome, wResto };
}

function buildAssinaturaHtmlInternal(sig: AssinaturaPayload, forOwa: boolean): string | null {
  const cfg = resolverConfig(sig);
  if (!cfg) return null;

  let { cor, font, entidade, banner, wNome, wResto, fontFace } = cfg;
  if (forOwa) {
    ({ font, wNome, wResto } = resolveFontForOwa(font, wNome, wResto));
  }
  const fontFaceBlock = !forOwa && fontFace ? buildFontFace() : '';
  const icoMail = buildIconSpan(cor, '&#x2709;');
  const icoPhone = buildIconSpan(cor, '&#x260E;');

  let conteudo: string;

  if (sig.tipo === 'compartilhada') {
    let celLine = '';
    if (sig.celular) {
      const cel = telHref(sig.celular);
      celLine = ` | <a href="tel:${cel}" style="color:${cor};text-decoration:underline">${sig.celular}</a>`;
    }
    let foneHtml = '';
    if (sig.telefone) {
      const tel = telHref(sig.telefone);
      foneHtml = `<p style="margin:0;font-size:10pt;font-family:${font};color:${cor};font-weight:${wResto}">${icoPhone} <a href="tel:${tel}" style="color:${cor};text-decoration:underline">${sig.telefone}</a>${celLine}</p>`;
    }
    conteudo = `
      <p style="margin:0 0 2px 0;font-size:11pt;font-family:${font};color:${cor};font-weight:${wNome}">${sig.nome || ''}</p>
      <p style="margin:0 0 10px 0;font-size:10pt;font-family:${font};color:${cor};font-weight:${wResto}">${sig.cargo || ''}</p>
      <p style="margin:0 0 3px 0;font-size:10pt;font-family:${font};color:${cor};font-weight:${wResto}">${icoMail} <a href="mailto:${sig.email}" style="color:${cor};text-decoration:underline">${sig.email}</a></p>
      ${foneHtml}`;
  } else {
    let celLine = '';
    if (sig.celular) {
      const cel = telHref(sig.celular);
      celLine = ` | <a href="tel:${cel}" style="color:${cor};text-decoration:underline">${sig.celular}</a>`;
    }
    let foneHtml = '';
    if (sig.telefone) {
      const tel = telHref(sig.telefone);
      foneHtml = `<p style="margin:0;font-size:10pt;font-family:${font};color:${cor};font-weight:${wResto}">${icoPhone} <a href="tel:${tel}" style="color:${cor};text-decoration:underline">${sig.telefone}</a>${celLine}</p>`;
    }
    conteudo = `
      <p style="margin:0 0 2px 0;font-size:11pt;font-family:${font};color:${cor};font-weight:${wNome}">${sig.nome || ''}</p>
      <p style="margin:0 0 10px 0;font-size:10pt;font-family:${font};color:${cor};font-weight:${wResto}">${sig.cargo || ''}</p>
      <p style="margin:0 0 3px 0;font-size:10pt;font-family:${font};color:${cor};font-weight:${wResto}">${icoMail} <a href="mailto:${sig.email}" style="color:${cor};text-decoration:underline">${sig.email}</a></p>
      ${foneHtml}`;
  }

  return `${fontFaceBlock}
<table border="0" cellpadding="0" cellspacing="0" width="700" style="font-family:${font}">
  <tr>
    <td width="250" valign="middle" style="padding:0 12px 0 0">
      <img width="250" height="103" src="${banner}" alt="${entidade}" style="display:block">
    </td>
    <td valign="top" style="padding:6px 0 0 16px;border-left:1px solid #e0e0e0">${conteudo}
    </td>
  </tr>
</table>
<p style="font-size:7.5pt;font-family:Verdana,sans-serif;color:#BABABA;font-style:italic;margin:6px 0 0 0">O conteúdo do presente e-mail, incluindo eventuais arquivos anexados, foi enviado pela <b>${entidade}</b> para uso exclusivo do(s) destinatário(s) e envolve informações confidenciais protegidas por contratos e/ou por lei. Seu conteúdo não deve ser compartilhado, distribuído ou copiado sem o consentimento da mesma, na figura do remetente do presente e-mail.</p>
<p style="font-size:7.5pt;font-family:Verdana,sans-serif;color:#BABABA;font-style:italic;margin:4px 0 0 0">The content of this email, including any attachments, was sent by <b>${entidade}</b> for the exclusive use of the recipient(s) and involve confidential information protected by contracts and/or by law. Its content should not be shared, distributed or copied without the consent of <b>${entidade}</b>, through the authorization by the sender of this e-mail.</p>`;
}

export function buildAssinaturaHtml(sig: AssinaturaPayload): string | null {
  return buildAssinaturaHtmlInternal(sig, false);
}

/** Variante sem @font-face e com fontes web-safe — compatível com colagem no Outlook Web. */
export function buildAssinaturaHtmlForOwa(sig: AssinaturaPayload): string | null {
  return buildAssinaturaHtmlInternal(sig, true);
}
