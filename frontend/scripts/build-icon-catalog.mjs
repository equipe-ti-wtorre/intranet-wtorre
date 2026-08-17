#!/usr/bin/env node
/**
 * Gera sprites SVG, índices de busca e valida tamanho máximo de icone (VARCHAR).
 * Saída: public/assets/icon-catalog/
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getIconsData } from 'simple-icons/sdk';
import * as SimpleIcons from 'simple-icons';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets', 'icon-catalog');
const SRC_ASSETS = path.join(ROOT, 'src', 'assets', 'icon-catalog');
const LUCIDE_ICONS_DIR = path.join(ROOT, 'node_modules', 'lucide-static', 'icons');
const LUCIDE_TAGS = path.join(ROOT, 'node_modules', 'lucide-static', 'tags.json');
const MATERIAL_PKG_DIR = path.join(ROOT, 'node_modules', '@material-symbols', 'svg-400');
const MATERIAL_STYLES = ['outlined', 'rounded', 'sharp'];
const BACKEND_SCRIPTS = path.resolve(ROOT, '..', 'backend', 'scripts');

const BASE_SYNONYMS = {
  pasta: 'folder',
  escudo: 'shield',
  capelo: 'graduation-cap',
  documento: 'file-text',
  doc: 'file-text',
  arquivo: 'file',
  cadeado: 'lock',
  crachá: 'id-card',
  cracha: 'id-card',
  lixeira: 'trash',
  balança: 'scale',
  balanca: 'scale',
  marca: 'badge',
};

function sanitizeSvgContent(content, context) {
  if (/<script[\s>]/i.test(content)) {
    throw new Error(`Conteúdo suspeito (<script>) em ${context}`);
  }
  if (/\son[a-z]+\s*=/i.test(content)) {
    throw new Error(`Conteúdo suspeito (on*) em ${context}`);
  }
  if (/javascript:/i.test(content)) {
    throw new Error(`Conteúdo suspeito (javascript:) em ${context}`);
  }
  return content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"])[^'"]*\1/gi, '');
}

function extractSvgParts(svgText) {
  const viewBoxMatch = svgText.match(/viewBox="([^"]+)"/i);
  const viewBox = viewBoxMatch?.[1] ?? '0 0 24 24';
  const inner = svgText
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim();
  const strokeAttrs = [];
  for (const attr of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) {
    const m = svgText.match(new RegExp(`${attr}="([^"]+)"`, 'i'));
    if (m) strokeAttrs.push(`${attr}="${m[1]}"`);
  }
  return { viewBox, inner: sanitizeSvgContent(inner, 'lucide'), strokeAttrs };
}

async function buildLucide() {
  const tags = JSON.parse(await fs.readFile(LUCIDE_TAGS, 'utf8'));
  const files = (await fs.readdir(LUCIDE_ICONS_DIR)).filter((f) => f.endsWith('.svg'));
  const symbols = [];
  const index = [];
  let maxLen = 0;

  for (const file of files.sort()) {
    const name = file.replace(/\.svg$/, '');
    const raw = await fs.readFile(path.join(LUCIDE_ICONS_DIR, file), 'utf8');
    const { viewBox, inner, strokeAttrs } = extractSvgParts(raw);
    const attrs = strokeAttrs.length
      ? strokeAttrs.join(' ')
      : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    symbols.push(`  <symbol id="${name}" viewBox="${viewBox}" ${attrs}>${inner}</symbol>`);
    index.push({ name, tags: tags[name] ?? [] });
    maxLen = Math.max(maxLen, `lucide:${name}`.length);
  }

  const sprite =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n` +
    symbols.join('\n') +
    '\n</svg>';

  return { sprite, index, maxLen, count: files.length };
}

async function buildBrands() {
  const metaBySlug = new Map((await getIconsData()).map((i) => [i.slug, i]));
  const symbols = [];
  const index = [];
  let maxLen = 0;
  let count = 0;

  for (const key of Object.keys(SimpleIcons).sort()) {
    if (!key.startsWith('si') || key === 'siDefault') continue;
    const icon = SimpleIcons[key];
    if (!icon?.path) continue;
    const pathD = sanitizeSvgContent(icon.path, `brand:${icon.slug}`);
    symbols.push(
      `  <symbol id="${icon.slug}" viewBox="0 0 24 24"><path d="${pathD}" fill="currentColor"/></symbol>`
    );
    const meta = metaBySlug.get(icon.slug);
    index.push({
      slug: icon.slug,
      title: icon.title,
      hex: `#${icon.hex}`,
      aliases: meta?.aliases ?? undefined,
    });
    maxLen = Math.max(maxLen, `brand:${icon.slug}`.length);
    count++;
  }

  const sprite =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n` +
    symbols.join('\n') +
    '\n</svg>';

  return { sprite, index, maxLen, count };
}

async function buildMaterial() {
  const symbols = [];
  const index = [];
  let maxLen = 0;
  let count = 0;

  for (const style of MATERIAL_STYLES) {
    const dir = path.join(MATERIAL_PKG_DIR, style);
    const files = (await fs.readdir(dir))
      .filter((f) => f.endsWith('.svg') && !f.endsWith('-fill.svg'))
      .sort();

    for (const file of files) {
      const name = file.replace(/\.svg$/, '');
      const symbolId = `${style}_${name}`;
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      const { viewBox, inner } = extractSvgParts(raw);
      const attrs = 'fill="currentColor"';
      symbols.push(
        `  <symbol id="${symbolId}" viewBox="${viewBox}" ${attrs}>${sanitizeSvgContent(inner, `material:${style}:${name}`)}</symbol>`
      );
      index.push({ name, style });
      maxLen = Math.max(maxLen, `material:${style}:${name}`.length);
      count++;
    }
  }

  const sprite =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n` +
    symbols.join('\n') +
    '\n</svg>';

  return { sprite, index, maxLen, count };
}

async function loadSynonyms() {
  const sourcePath = path.join(SRC_ASSETS, 'synonyms-pt.source.json');
  let manual = {};
  try {
    manual = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
  } catch {
    console.warn('synonyms-pt.source.json não encontrado; usando apenas base.');
  }
  return { ...BASE_SYNONYMS, ...manual };
}

async function loadChips() {
  const sourcePath = path.join(SRC_ASSETS, 'chips.source.json');
  try {
    return JSON.parse(await fs.readFile(sourcePath, 'utf8'));
  } catch {
    return [];
  }
}

async function writeVarcharScript(globalMax) {
  if (globalMax <= 50) return;
  await fs.mkdir(BACKEND_SCRIPTS, { recursive: true });
  const sqlPath = path.join(BACKEND_SCRIPTS, 'alter-categorias-icone-varchar64.sql');
  const sql = `-- Gerado por build-icon-catalog.mjs — MAX icone = ${globalMax} chars (> 50)
-- Executar manualmente em produção ANTES de liberar ícones com slugs longos.
ALTER TABLE categorias_documentos MODIFY COLUMN icone VARCHAR(64) NULL;
`;
  await fs.writeFile(sqlPath, sql, 'utf8');
  console.log(`⚠ MAX icone (${globalMax}) > 50 — script gerado: ${sqlPath}`);
}

async function main() {
  console.log('Gerando catálogo de ícones…');
  await fs.mkdir(OUT, { recursive: true });

  const lucide = await buildLucide();
  const brands = await buildBrands();
  const material = await buildMaterial();
  const synonyms = await loadSynonyms();
  const chips = await loadChips();

  await Promise.all([
    fs.writeFile(path.join(OUT, 'lucide-sprite.svg'), lucide.sprite, 'utf8'),
    fs.writeFile(path.join(OUT, 'brand-sprite.svg'), brands.sprite, 'utf8'),
    fs.writeFile(path.join(OUT, 'material-sprite.svg'), material.sprite, 'utf8'),
    fs.writeFile(path.join(OUT, 'lucide-index.json'), JSON.stringify(lucide.index), 'utf8'),
    fs.writeFile(path.join(OUT, 'brand-index.json'), JSON.stringify(brands.index), 'utf8'),
    fs.writeFile(path.join(OUT, 'material-index.json'), JSON.stringify(material.index), 'utf8'),
    fs.writeFile(path.join(OUT, 'synonyms-pt.json'), JSON.stringify(synonyms, null, 2), 'utf8'),
    fs.writeFile(path.join(OUT, 'chips.json'), JSON.stringify(chips, null, 2), 'utf8'),
  ]);

  const globalMax = Math.max(lucide.maxLen, brands.maxLen, material.maxLen);
  console.log(`Lucide: ${lucide.count} ícones (max lucide:name = ${lucide.maxLen})`);
  console.log(`Marcas: ${brands.count} ícones (max brand:slug = ${brands.maxLen})`);
  console.log(`Material: ${material.count} ícones (max material:style:name = ${material.maxLen})`);
  console.log(`MAX global prefix:slug = ${globalMax}`);

  if (globalMax > 50) {
    await writeVarcharScript(globalMax);
  } else {
    console.log('VARCHAR(50) suficiente para todos os slugs.');
  }

  console.log(`Catálogo gravado em ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
