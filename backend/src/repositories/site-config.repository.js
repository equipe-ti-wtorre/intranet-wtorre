const { getPool } = require('../db/pool');
const { normalizarIconePersistido } = require('../utils/doc-icone.util');

const FOOTER_CONFIG_KEY = 'footer.config';
const TOPBAR_CONFIG_KEY = 'topbar.config';
const LOGIN_CONFIG_KEY = 'login.config';

const LOGIN_VARIANTES = new Set(['wt', 'nb', 'bs', 'an']);
const LOGIN_ESTILOS = new Set(['wlogo', 'led']);

const LOGIN_VARIANTE_CORES = {
  wt: '#1d54e6',
  nb: '#8d0de3',
  bs: '#0d9488',
  an: '#c2410c',
};

const LOGIN_VARIANTE_ESTILOS = {
  wt: 'wlogo',
  nb: 'led',
  bs: 'led',
  an: 'led',
};

const LOGIN_DEFAULTS = {
  favicon_url: null,
  marca_topo: {
    titulo: 'GRUPO WTORRE',
    subtitulo: 'INTRANET CORPORATIVA',
    exibir: true,
  },
  hero: {
    titulo_linha1: 'Um só grupo.',
    titulo_destaque: 'Quatro grandes destinos.',
    lead:
      'Acesse sistemas, documentos e serviços das empresas do grupo em uma única plataforma segura.',
    exibir: true,
  },
  pill: {
    texto: 'PÁGINA CORPORATIVA · ACESSO RESTRITO',
  },
  auth: {
    titulo: 'Entrar na intranet',
    subtitulo: 'Use sua conta corporativa Microsoft para continuar.',
  },
  aviso_seguranca:
    'Aviso de segurança. Este é um sistema de uso exclusivo do Grupo WTorre. O acesso é monitorado e registrado. O uso não autorizado é proibido e pode estar sujeito a medidas disciplinares e legais. Ao continuar, você concorda com a Política de Segurança da Informação.',
  rodape: {
    copyright: '© 2026 Grupo WTorre · Uso interno e confidencial',
    contato: 'CCO: Ramal 6673 · TEL.: (11) 4800-6673',
  },
  empresas_titulo: 'Empresas do grupo',
  empresas: [
    { id: 'wtorre', nome: 'WTORRE', variante: 'wt', cor: '#1d54e6', estilo: 'wlogo', imagem_url: null, link_url: null, nova_aba: true, ordem: 0 },
    { id: 'nubank', nome: 'Nubank Parque', variante: 'nb', cor: '#8d0de3', estilo: 'led', imagem_url: null, link_url: null, nova_aba: true, ordem: 1 },
    { id: 'base', nome: 'base', variante: 'bs', cor: '#0d9488', estilo: 'led', imagem_url: null, link_url: null, nova_aba: true, ordem: 2 },
    { id: 'anhangabau', nome: 'Anhangabaú', variante: 'an', cor: '#c2410c', estilo: 'led', imagem_url: null, link_url: null, nova_aba: true, ordem: 3 },
  ],
};
const HOME_CARROSSEL_KEY = 'home.carrossel';
const HOME_SISTEMAS_KEY = 'home.sistemas';

const HOME_CARROSSEL_DEFAULTS = {
  autoplay: true,
  intervaloMs: 5000,
  alturaPx: 420,
  slides: [],
};

/** Ícones curtos do seed legado → formato atual (lucide:/brand:/…). */
const HOME_SISTEMAS_ICONES_LEGADO = {
  user: 'lucide:user',
  wallet: 'lucide:wallet',
  badge: 'lucide:badge',
  database: 'lucide:database',
  cloud: 'lucide:cloud',
  check: 'lucide:circle-check',
  task: 'lucide:list-todo',
  building: 'lucide:building-2',
  phone: 'lucide:phone',
};

const HOME_SISTEMAS_ICONE_PADRAO = 'lucide:user';

const HOME_SISTEMAS_DEFAULTS = {
  tag: 'Acesso rápido',
  titulo: 'Sistemas Corporativos',
  linkTodos: null,
  linkTodosNovaAba: false,
  itens: [],
};

const TOPBAR_DEFAULTS = {
  suporte: {
    texto: 'CCO: Ramal 6673 TEL.: (11) 4800 - 6673',
  },
  logos: [
    {
      id: 'wtorre',
      nome: 'WTorre',
      alt: 'WTorre',
      imagem_url: '/logos/wtorre.png',
      link_url: null,
      nova_aba: true,
      ordem: 0,
    },
    {
      id: 'nubank',
      nome: 'Nubank Parque',
      alt: 'Nubank Parque',
      imagem_url: '/logos/nubank-parque.png',
      link_url: null,
      nova_aba: true,
      ordem: 1,
    },
    {
      id: 'base',
      nome: 'Base Coworking',
      alt: 'Base Coworking',
      imagem_url: '/logos/base-coworking.png',
      link_url: null,
      nova_aba: true,
      ordem: 2,
    },
    {
      id: 'novo',
      nome: 'Novo Anhangabaú',
      alt: 'Novo Anhangabaú',
      imagem_url: '/logos/novo-anhangabau.png',
      link_url: null,
      nova_aba: true,
      ordem: 3,
    },
  ],
};

const FOOTER_DEFAULTS = {
  marca: {
    titulo: 'GRUPO WTORRE',
    descricao:
      'Intranet corporativa unificada. Conectando pessoas, sistemas e os destinos do grupo em uma única plataforma.',
  },
  colunas: [
    {
      id: 'empresas',
      titulo: 'Empresas',
      links: [
        { label: 'WTorre', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Nubank Parque', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Base Coworking', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Novo Anhangabaú', url: null, tipo_destino: 'interna', nova_aba: false },
      ],
    },
    {
      id: 'atalhos',
      titulo: 'Atalhos',
      links: [
        { label: 'Abertura de Chamados', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Sistemas Corporativos', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Documentos', url: '/documentos', tipo_destino: 'interna', nova_aba: false },
        { label: 'Oportunidades', url: null, tipo_destino: 'interna', nova_aba: false },
      ],
    },
    {
      id: 'suporte',
      titulo: 'Suporte',
      links: [
        { label: 'Service Desk · 4040', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Segurança da Informação', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Compliance', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Fale com o RH', url: null, tipo_destino: 'interna', nova_aba: false },
      ],
    },
  ],
  sponsors: [
    { label: 'WTORRE', url: null, nova_aba: true },
    { label: 'NUBANK PARQUE', url: null, nova_aba: true },
    { label: 'BASE COWORKING', url: null, nova_aba: true },
    { label: 'NOVO ANHANGABAÚ', url: null, nova_aba: true },
  ],
  legal: {
    copyright: '© 2026 Grupo WTorre · Uso interno e confidencial',
    links_texto: 'Política de Privacidade · Termos de Uso · v2.4',
  },
};

const COLUNA_IDS = ['empresas', 'atalhos', 'suporte'];

const HEADER_KEYS = {
  label: 'header.chamado.label',
  url: 'header.chamado.url',
  ativo: 'header.chamado.ativo',
  novaAba: 'header.chamado.nova_aba',
};

async function get(chave) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT valor FROM site_config WHERE chave = ? LIMIT 1', [
    chave,
  ]);
  return rows[0]?.valor ?? null;
}

async function getMany(chaves) {
  if (!chaves.length) return {};
  const pool = getPool();
  const placeholders = chaves.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT chave, valor FROM site_config WHERE chave IN (${placeholders})`,
    chaves
  );
  const map = {};
  for (const row of rows) {
    map[row.chave] = row.valor;
  }
  return map;
}

async function set(chave, valor) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO site_config (chave, valor) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor), atualizado_em = CURRENT_TIMESTAMP`,
    [chave, valor]
  );
}

async function getHeaderChamado() {
  const vals = await getMany(Object.values(HEADER_KEYS));
  const url = vals[HEADER_KEYS.url] || null;
  const isExterna = url && /^https?:\/\//i.test(url);

  return {
    label: vals[HEADER_KEYS.label] || 'Abrir Chamado',
    url,
    ativo: vals[HEADER_KEYS.ativo] === '1',
    abrir_nova_aba: vals[HEADER_KEYS.novaAba] !== '0',
    tipo_destino: url ? (isExterna ? 'externa' : 'interna') : 'interna',
  };
}

async function setHeaderChamado({ label, url, ativo, abrir_nova_aba }) {
  await set(HEADER_KEYS.label, label || 'Abrir Chamado');
  await set(HEADER_KEYS.url, url || null);
  await set(HEADER_KEYS.ativo, ativo ? '1' : '0');
  await set(HEADER_KEYS.novaAba, abrir_nova_aba ? '1' : '0');
  return getHeaderChamado();
}

function normalizeFooterLink(link) {
  return {
    label: String(link?.label ?? '').trim(),
    url: link?.url?.trim() || null,
    tipo_destino: link?.tipo_destino === 'externa' ? 'externa' : 'interna',
    nova_aba: !!link?.nova_aba,
  };
}

function sponsorsFromEmpresas(colunas) {
  const empresas = colunas.find((c) => c.id === 'empresas');
  return (empresas?.links ?? [])
    .map((l) => ({
      label: String(l.label ?? '').trim().toUpperCase(),
      url: l.url?.trim() || null,
      nova_aba: l.tipo_destino === 'externa' ? l.nova_aba !== false : !!l.nova_aba,
    }))
    .filter((s) => s.label);
}

function normalizeFooterSponsor(item) {
  const url = item?.url?.trim() || null;
  return {
    label: String(item?.label ?? '').trim(),
    url,
    nova_aba: item?.nova_aba !== false,
  };
}

function normalizeFooterConfig(raw) {
  const base = structuredClone(FOOTER_DEFAULTS);

  if (raw?.marca) {
    base.marca.titulo = String(raw.marca.titulo ?? base.marca.titulo).trim() || base.marca.titulo;
    base.marca.descricao =
      String(raw.marca.descricao ?? base.marca.descricao).trim() || base.marca.descricao;
  }

  if (Array.isArray(raw?.colunas)) {
    for (const colId of COLUNA_IDS) {
      const incoming = raw.colunas.find((c) => c?.id === colId);
      const target = base.colunas.find((c) => c.id === colId);
      if (!incoming || !target) continue;

      target.titulo = String(incoming.titulo ?? target.titulo).trim() || target.titulo;
      if (Array.isArray(incoming.links)) {
        target.links = incoming.links.map(normalizeFooterLink).filter((l) => l.label);
      }
    }
  }

  if (raw?.legal) {
    base.legal.copyright =
      String(raw.legal.copyright ?? base.legal.copyright).trim() || base.legal.copyright;
    base.legal.links_texto =
      String(raw.legal.links_texto ?? base.legal.links_texto).trim() || base.legal.links_texto;
  }

  if (Array.isArray(raw?.sponsors) && raw.sponsors.length) {
    base.sponsors = raw.sponsors.map(normalizeFooterSponsor).filter((s) => s.label);
  } else {
    const derived = sponsorsFromEmpresas(base.colunas);
    base.sponsors = derived.length ? derived : base.sponsors;
  }

  return base;
}

async function getFooter() {
  const raw = await get(FOOTER_CONFIG_KEY);
  if (!raw) return structuredClone(FOOTER_DEFAULTS);

  try {
    return normalizeFooterConfig(JSON.parse(raw));
  } catch {
    return structuredClone(FOOTER_DEFAULTS);
  }
}

async function setFooter(config) {
  const normalized = normalizeFooterConfig(config);
  await set(FOOTER_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeTopbarLogo(logo, index) {
  return {
    id: String(logo?.id ?? '').trim(),
    nome: String(logo?.nome ?? '').trim(),
    alt: String(logo?.alt ?? logo?.nome ?? '').trim(),
    imagem_url: String(logo?.imagem_url ?? '').trim(),
    link_url: logo?.link_url?.trim() || null,
    nova_aba: logo?.nova_aba !== false,
    ordem: Number.isFinite(Number(logo?.ordem)) ? Number(logo.ordem) : index,
  };
}

function normalizeTopbarConfig(raw) {
  const base = structuredClone(TOPBAR_DEFAULTS);

  if (raw?.suporte) {
    base.suporte.texto =
      String(raw.suporte.texto ?? base.suporte.texto).trim() || base.suporte.texto;
  }

  if (Array.isArray(raw?.logos) && raw.logos.length) {
    base.logos = raw.logos
      .map(normalizeTopbarLogo)
      .filter((l) => l.id && l.nome && l.imagem_url)
      .sort((a, b) => a.ordem - b.ordem);
  }

  return base;
}

async function getTopbar() {
  const raw = await get(TOPBAR_CONFIG_KEY);
  if (!raw) return structuredClone(TOPBAR_DEFAULTS);

  try {
    return normalizeTopbarConfig(JSON.parse(raw));
  } catch {
    return structuredClone(TOPBAR_DEFAULTS);
  }
}

async function setTopbar(config) {
  const normalized = normalizeTopbarConfig(config);
  await set(TOPBAR_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeCarrosselSlide(slide, index) {
  return {
    id: String(slide?.id ?? '').trim(),
    url: String(slide?.url ?? '').trim(),
    alt: String(slide?.alt ?? '').trim(),
    legenda: slide?.legenda?.trim() || null,
    link: slide?.link?.trim() || null,
    ordem: Number.isFinite(Number(slide?.ordem)) ? Number(slide.ordem) : index,
  };
}

function normalizeHomeCarrossel(raw) {
  const base = structuredClone(HOME_CARROSSEL_DEFAULTS);

  if (raw && typeof raw === 'object') {
    base.autoplay = raw.autoplay !== false;
    const intervalo = Number(raw.intervaloMs);
    if (Number.isFinite(intervalo)) base.intervaloMs = intervalo;
    const altura = Number(raw.alturaPx);
    if (Number.isFinite(altura)) base.alturaPx = altura;
    if (Array.isArray(raw.slides)) {
      base.slides = raw.slides
        .map(normalizeCarrosselSlide)
        .filter((s) => s.id && s.url)
        .sort((a, b) => a.ordem - b.ordem);
    }
  }

  base.intervaloMs = Math.min(60000, Math.max(1000, base.intervaloMs));
  base.alturaPx = Math.min(800, Math.max(200, base.alturaPx));

  return base;
}

async function getHomeCarrossel() {
  const raw = await get(HOME_CARROSSEL_KEY);
  if (!raw) return structuredClone(HOME_CARROSSEL_DEFAULTS);

  try {
    return normalizeHomeCarrossel(JSON.parse(raw));
  } catch {
    return structuredClone(HOME_CARROSSEL_DEFAULTS);
  }
}

async function setHomeCarrossel(config) {
  const normalized = normalizeHomeCarrossel(config);
  await set(HOME_CARROSSEL_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeHomeSistemaIcon(raw) {
  const icon = String(raw ?? '').trim().toLowerCase();
  if (!icon) return HOME_SISTEMAS_ICONE_PADRAO;
  if (HOME_SISTEMAS_ICONES_LEGADO[icon]) return HOME_SISTEMAS_ICONES_LEGADO[icon];
  return normalizarIconePersistido(icon) || HOME_SISTEMAS_ICONE_PADRAO;
}

function normalizeHomeSistemaItem(item, index) {
  return {
    id: String(item?.id ?? '').trim() || `sistema-${index + 1}`,
    nome: String(item?.nome ?? '').trim(),
    subtitulo: String(item?.subtitulo ?? '').trim(),
    icon: normalizeHomeSistemaIcon(item?.icon),
    url: item?.url?.trim() || null,
    abrirNovaAba: item?.abrirNovaAba === true,
    ordem: Number.isFinite(Number(item?.ordem)) ? Number(item.ordem) : index + 1,
    ativo: item?.ativo !== false,
  };
}

function normalizeHomeSistemas(raw) {
  const base = structuredClone(HOME_SISTEMAS_DEFAULTS);

  if (raw && typeof raw === 'object') {
    if (raw.tag?.trim()) base.tag = String(raw.tag).trim();
    if (raw.titulo?.trim()) base.titulo = String(raw.titulo).trim();
    base.linkTodos = raw.linkTodos?.trim() || null;
    base.linkTodosNovaAba = raw.linkTodosNovaAba === true;
    if (Array.isArray(raw.itens)) {
      base.itens = raw.itens
        .map(normalizeHomeSistemaItem)
        .filter((item) => item.nome && item.subtitulo)
        .sort((a, b) => a.ordem - b.ordem);
    }
  }

  return base;
}

async function getHomeSistemas() {
  const raw = await get(HOME_SISTEMAS_KEY);
  if (!raw) return structuredClone(HOME_SISTEMAS_DEFAULTS);

  try {
    return normalizeHomeSistemas(JSON.parse(raw));
  } catch {
    return structuredClone(HOME_SISTEMAS_DEFAULTS);
  }
}

async function setHomeSistemas(config) {
  const normalized = normalizeHomeSistemas(config);
  await set(HOME_SISTEMAS_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeHexCor(value, fallback) {
  const raw = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function normalizeLoginEmpresa(empresa, index) {
  const varianteRaw = String(empresa?.variante ?? 'wt').trim().toLowerCase();
  const variante = LOGIN_VARIANTES.has(varianteRaw) ? varianteRaw : 'wt';
  const corPadrao = LOGIN_VARIANTE_CORES[variante] || LOGIN_VARIANTE_CORES.wt;
  const estiloRaw = String(empresa?.estilo ?? '').trim().toLowerCase();
  const estilo = LOGIN_ESTILOS.has(estiloRaw)
    ? estiloRaw
    : LOGIN_VARIANTE_ESTILOS[variante] || 'led';

  return {
    id: String(empresa?.id ?? '').trim(),
    nome: String(empresa?.nome ?? '').trim(),
    variante,
    cor: normalizeHexCor(empresa?.cor, corPadrao),
    estilo,
    imagem_url: empresa?.imagem_url?.trim() || null,
    link_url: empresa?.link_url?.trim() || null,
    nova_aba: empresa?.nova_aba !== false,
    ordem: Number.isFinite(Number(empresa?.ordem)) ? Number(empresa.ordem) : index,
  };
}

function normalizeLoginConfig(raw) {
  const base = structuredClone(LOGIN_DEFAULTS);

  if (raw?.favicon_url != null) {
    const favicon = String(raw.favicon_url).trim();
    base.favicon_url = favicon || null;
  }

  if (raw?.marca_topo) {
    base.marca_topo.titulo =
      String(raw.marca_topo.titulo ?? base.marca_topo.titulo).trim() || base.marca_topo.titulo;
    base.marca_topo.subtitulo =
      String(raw.marca_topo.subtitulo ?? base.marca_topo.subtitulo).trim() ||
      base.marca_topo.subtitulo;
    base.marca_topo.exibir = raw.marca_topo.exibir !== false;
  }

  if (raw?.hero) {
    base.hero.titulo_linha1 =
      String(raw.hero.titulo_linha1 ?? base.hero.titulo_linha1).trim() || base.hero.titulo_linha1;
    base.hero.titulo_destaque =
      String(raw.hero.titulo_destaque ?? base.hero.titulo_destaque).trim() ||
      base.hero.titulo_destaque;
    base.hero.lead = String(raw.hero.lead ?? base.hero.lead).trim() || base.hero.lead;
    base.hero.exibir = raw.hero.exibir !== false;
  }

  if (raw?.pill) {
    base.pill.texto = String(raw.pill.texto ?? base.pill.texto).trim() || base.pill.texto;
  }

  if (raw?.auth) {
    base.auth.titulo = String(raw.auth.titulo ?? base.auth.titulo).trim() || base.auth.titulo;
    base.auth.subtitulo =
      String(raw.auth.subtitulo ?? base.auth.subtitulo).trim() || base.auth.subtitulo;
  }

  if (raw?.aviso_seguranca != null) {
    base.aviso_seguranca =
      String(raw.aviso_seguranca).trim() || base.aviso_seguranca;
  }

  if (raw?.rodape) {
    base.rodape.copyright =
      String(raw.rodape.copyright ?? base.rodape.copyright).trim() || base.rodape.copyright;
    base.rodape.contato =
      String(raw.rodape.contato ?? base.rodape.contato).trim() || base.rodape.contato;
  }

  if (raw?.empresas_titulo != null) {
    base.empresas_titulo =
      String(raw.empresas_titulo).trim() || base.empresas_titulo;
  }

  if (Array.isArray(raw?.empresas) && raw.empresas.length) {
    base.empresas = raw.empresas
      .map(normalizeLoginEmpresa)
      .filter((e) => e.id && e.nome)
      .sort((a, b) => a.ordem - b.ordem);
  }

  return base;
}

async function getLogin() {
  const raw = await get(LOGIN_CONFIG_KEY);
  if (!raw) return structuredClone(LOGIN_DEFAULTS);

  try {
    return normalizeLoginConfig(JSON.parse(raw));
  } catch {
    return structuredClone(LOGIN_DEFAULTS);
  }
}

async function setLogin(config) {
  const normalized = normalizeLoginConfig(config);
  await set(LOGIN_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

module.exports = {
  FOOTER_CONFIG_KEY,
  TOPBAR_CONFIG_KEY,
  FOOTER_DEFAULTS,
  TOPBAR_DEFAULTS,
  HEADER_KEYS,
  get,
  getMany,
  set,
  getHeaderChamado,
  setHeaderChamado,
  getFooter,
  setFooter,
  normalizeFooterConfig,
  getTopbar,
  setTopbar,
  normalizeTopbarConfig,
  HOME_CARROSSEL_KEY,
  HOME_CARROSSEL_DEFAULTS,
  getHomeCarrossel,
  setHomeCarrossel,
  normalizeHomeCarrossel,
  HOME_SISTEMAS_KEY,
  HOME_SISTEMAS_DEFAULTS,
  getHomeSistemas,
  setHomeSistemas,
  normalizeHomeSistemas,
  LOGIN_CONFIG_KEY,
  LOGIN_DEFAULTS,
  getLogin,
  setLogin,
  normalizeLoginConfig,
};
