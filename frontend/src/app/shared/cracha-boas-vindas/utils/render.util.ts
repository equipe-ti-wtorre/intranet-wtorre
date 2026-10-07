import { BrandData } from '../data/brands.data';
import { ColaboradorCracha, FotoAjuste } from '../models/colaborador-cracha.model';

/** Assets estaticos do card de boas-vindas (servidos de /assets, ver frontend/public/assets/cracha-boas-vindas). */
export const ASSETS = {
  idIcon: '/assets/cracha-boas-vindas/id-icon.png',
  emailIcon: '/assets/cracha-boas-vindas/email-icon.png',
  rhLogo: '/assets/cracha-boas-vindas/rh-logo.png',
};

/**
 * CSS do cartao de boas-vindas, portado de central-rh-cracha-boas-vindas.html.
 * Exportado como string (em vez de depender do SCSS do componente) para que
 * exportCrachaJPEG/exportBoasVindasJPEG (utils/export.util.ts) consigam renderizar
 * o card num container fora da arvore do Angular com o visual correto,
 * independente de ViewEncapsulation.
 */
export const BOAS_VINDAS_CSS = `
  .bv-card{ width:560px; background:#fff; font-family:'Roboto',Arial,sans-serif; overflow:hidden; box-shadow:0 10px 40px rgba(0,0,0,.15); border-radius:2px; }
  .bv-top{ padding:26px 44px 0; text-align:center; background:#fff; padding-bottom:92px; }
  .bv-kicker{ font-size:10px; font-weight:700; letter-spacing:1.5px; color:#6B7785; margin-bottom:8px; }
  .bv-logo-wrap{ display:flex; justify-content:center; margin-bottom:4px; }
  .bv-logo-wrap svg{ height:34px; width:auto; }
  .bv-divider{ height:1px; background:#333; margin:16px 50px; }
  .bv-intro{ font-size:13.5px; line-height:1.5; color:#003C71; padding:0 30px; margin:0; }
  .bv-intro strong{ font-weight:700; }
  .bv-blue{ background:#003C71; position:relative; }
  .bv-photo-wrap{ width:200px; height:200px; margin:0 auto; position:relative; top:-78px; margin-bottom:-78px; }
  .bv-bubble-row{ padding:28px 66px 26px; }
  .bv-bubble{ background:#fff; border-radius:18px; padding:26px 34px; position:relative; box-shadow:0 6px 20px rgba(0,0,0,.12); }
  .bv-bubble::before{ content:''; position:absolute; top:-13px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:13px solid transparent; border-right:13px solid transparent; border-bottom:13px solid #fff; }
  .bv-quote{ color:#003C71; font-weight:900; font-size:26px; line-height:1; font-family:Georgia,'Times New Roman',serif; }
  .bv-quote.open{ position:absolute; top:14px; left:16px; }
  .bv-quote.close{ position:absolute; bottom:4px; right:20px; }
  .bv-bubble-text{ font-style:italic; font-size:12.5px; line-height:1.6; color:#003C71; text-align:center; white-space:pre-wrap; margin:0; }
  .bv-info-row{ display:flex; justify-content:center; gap:70px; padding:0 30px 52px; }
  .bv-info-item{ text-align:center; width:210px; }
  .bv-info-item img{ height:30px; margin-bottom:8px; }
  .bv-info-item .l1, .bv-info-item .l2{ color:#fff; font-size:11.5px; line-height:1.4; }
  .bv-bottom{ background:#02305A; padding:20px 16px; text-align:center; }
  .bv-bottom .name{ color:#fff; font-size:23px; font-weight:900; margin:0 0 5px; }
  .bv-bottom .msg{ color:#fff; font-size:13.5px; font-weight:700; margin:0; }
`;

export function escapeHtml(str: string | null | undefined): string {
  return (str == null ? '' : String(str))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(str: string | null | undefined): string {
  return (str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function firstName(full: string | null | undefined): string {
  const parts = (full || '').trim().split(/\s+/);
  return parts[0] || '';
}

/** cx,cy,r no espaco de coordenadas de quem chama. foto tem zoom/panX/panY normalizados pelo diametro. */
export function photoCircleMarkup(
  cx: number,
  cy: number,
  r: number,
  foto: FotoAjuste | null | undefined,
  strokeColor: string,
  strokeWidth: number,
  uid: string
): string {
  const D = r * 2;
  const clipId = 'pclip' + uid;
  let inner: string;
  if (foto && foto.dataUrl) {
    const rotation = foto.rotation || 0;
    const swapped = rotation === 90 || rotation === 270;
    const effW = swapped ? foto.naturalH : foto.naturalW;
    const effH = swapped ? foto.naturalW : foto.naturalH;
    const totalScale = (D / Math.min(effW, effH)) * foto.zoom;
    const rw = foto.naturalW * totalScale;
    const rh = foto.naturalH * totalScale;
    const centerX = cx + (foto.panX || 0) * D;
    const centerY = cy + (foto.panY || 0) * D;
    const x = centerX - rw / 2;
    const y = centerY - rh / 2;
    // Fundo branco atrás da foto: com zoom < 100% (padrão ao inserir uma foto nova, ver
    // ZOOM_INICIAL em photo.util.ts) ela não cobre mais o círculo inteiro, então sem isso
    // sobraria uma folga transparente mostrando o que estiver atrás.
    inner =
      `<g clip-path="url(#${clipId})">` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"></circle>` +
      `<image href="${foto.dataUrl}" x="${x}" y="${y}" width="${rw}" height="${rh}" preserveAspectRatio="none" transform="rotate(${rotation} ${centerX} ${centerY})"></image>` +
      `</g>`;
  } else {
    inner =
      `<g clip-path="url(#${clipId})">` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e8f0f8"></circle>` +
      `<circle cx="${cx}" cy="${cy - r * 0.217}" r="${r * 0.304}" fill="#b0c4d8"></circle>` +
      `<ellipse cx="${cx}" cy="${cy + r * 0.652}" rx="${r * 0.521}" ry="${r * 0.434}" fill="#b0c4d8"></ellipse>` +
      `</g>`;
  }
  return (
    `<defs><clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${r}"></circle></clipPath></defs>` +
    inner +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"></circle>`
  );
}

export function standalonePhotoSVG(
  D: number,
  foto: FotoAjuste | null | undefined,
  strokeColor: string,
  strokeWidth: number,
  uid: string
): string {
  const r = D / 2 - strokeWidth / 2;
  return (
    `<svg viewBox="0 0 ${D} ${D}" width="${D}" height="${D}">` +
    photoCircleMarkup(D / 2, D / 2, r, foto, strokeColor, strokeWidth, uid) +
    `</svg>`
  );
}

function brandLogoMarkup(brand: BrandData): string {
  if (brand.markup) {
    return `<svg x="20" y="16" width="113.07" height="42" viewBox="${brand.viewBox}" preserveAspectRatio="xMidYMid meet">${brand.markup}</svg>`;
  }
  if (brand.logoHref) {
    // Marca sem arte vetorial disponivel (ex.: Nubank Parque) - usa logo raster.
    return `<svg x="14" y="20" width="125" height="34" viewBox="${brand.viewBox}" preserveAspectRatio="xMidYMid meet"><image href="${brand.logoHref}" x="0" y="0" width="750" height="130"></image></svg>`;
  }
  // Marca sem logo (vetor ou raster) definido ainda - usa o mesmo layout/posicao do
  // wordmark do cracha WTorre, so que com o nome da marca em texto simples. O viewBox
  // acompanha o tamanho do texto (em vez de um valor fixo) pra nomes longos (ex.: "REAL
  // ARENAS") nao vazarem pra fora da area do logo - preserveAspectRatio encolhe o texto
  // todo junto em vez de cortar as ultimas letras.
  const text = escapeXml(brand.logoText || brand.name);
  const charWidth = 17; // estimativa grosseira p/ Archivo/Roboto bold maiusculo, font-size 28
  const vbWidth = Math.max(120, text.length * charWidth + 24);
  return `<svg x="20" y="16" width="113.07" height="42" viewBox="0 0 ${vbWidth} 42" preserveAspectRatio="xMidYMid meet"><text x="${vbWidth / 2}" y="30" text-anchor="middle" font-family="'Archivo','Roboto',Arial,sans-serif" font-weight="800" font-size="28" fill="${brand.color}">${text}</text></svg>`;
}

export function renderCrachaSVG(colab: ColaboradorCracha, brand: BrandData): string {
  const logoMarkup = brandLogoMarkup(brand);
  const photo = photoCircleMarkup(76.54, 121.67, 46.1, colab.foto, brand.color, 3, 'cracha');
  const name = escapeXml(colab.nomeCompleto || 'Nome do Colaborador');
  return (
    `<svg id="crachaSvg" viewBox="0 0 153.07 243.78" xmlns="http://www.w3.org/2000/svg" style="width:270px;height:430px;display:block;background:#fff;border-radius:3px;box-shadow:0 8px 30px rgba(1,103,158,.2),0 2px 6px rgba(0,0,0,.1);">` +
    `<rect x="0" y="0" width="153.07" height="243.78" fill="#ffffff"></rect>` +
    logoMarkup +
    `<g id="photoGroup">${photo}</g>` +
    `<text fill="#254470" font-family="'Roboto','Arial',sans-serif" font-size="12" font-weight="400" text-anchor="middle" x="76.54" y="188.67" letter-spacing="0.3">${name}</text>` +
    `</svg>`
  );
}

export function renderBoasVindasCard(colab: ColaboradorCracha): string {
  const fullName = colab.nomeCompleto || 'Nome Sobrenome';
  const shortName = colab.nomeCurto || firstName(fullName);
  const area = colab.area || 'Área';
  const cargo = (colab.cargo || 'Cargo').replace(/\.+$/, '');
  const email = colab.email || 'email@empresa.com.br';
  const bio = colab.bio || '';
  const genero = colab.genero;
  // 'N' (neutro) é usado quando a origem dos dados não coleta gênero (ex.: geração
  // automática a partir da Solicitação de Colaborador) - evita presumir gênero pelo nome.
  const chegadaDe = genero === 'N' ? 'de' : genero === 'M' ? 'do' : 'da';
  const artigoMai = genero === 'N' ? '' : genero === 'M' ? 'O ' : 'A ';
  const bemvindo = genero === 'N' ? 'bem-vindo(a)' : genero === 'M' ? 'bem-vindo' : 'bem-vinda';

  const photoSvg = standalonePhotoSVG(200, colab.foto, '#ffffff', 6, 'bv');

  return `
    <div class="bv-card" id="boasCard">
      <div class="bv-top">
        <div class="bv-logo-wrap"><img src="${ASSETS.rhLogo}" alt="RH Conecta" style="height:90px;width:auto;"></div>
        <div class="bv-divider"></div>
        <p class="bv-intro">É com muito prazer que o grupo WTorre comunica a chegada ${chegadaDe} <strong>${escapeHtml(fullName)}</strong> ao nosso time de ${escapeHtml(area)}.</p>
      </div>
      <div class="bv-blue">
        <div class="bv-photo-wrap">${photoSvg}</div>
        <div class="bv-bubble-row">
          <div class="bv-bubble">
            <span class="bv-quote open">&ldquo;</span>
            <p class="bv-bubble-text">${escapeHtml(bio)}</p>
            <span class="bv-quote close">&rdquo;</span>
          </div>
        </div>
        <div class="bv-info-row">
          <div class="bv-info-item">
            <img src="${ASSETS.idIcon}" alt="crachá">
            <div class="l1">${artigoMai}${escapeHtml(shortName)} fará parte do nosso time como ${escapeHtml(cargo)}.</div>
          </div>
          <div class="bv-info-item">
            <img src="${ASSETS.emailIcon}" alt="email">
            <div class="l1">E-mail</div>
            <div class="l2">${escapeHtml(email)}</div>
          </div>
        </div>
      </div>
      <div class="bv-bottom">
        <p class="name">${escapeHtml(shortName)},</p>
        <p class="msg">seja muito ${bemvindo} ao nosso time!</p>
      </div>
    </div>`;
}
