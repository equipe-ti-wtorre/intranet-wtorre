// Texto formatado das notas. O corpo guardado no banco é HTML limpo com um marcador no começo;
// notas antigas (texto puro, sem marcador) continuam abrindo normalmente.
export const RT_MARK = '<!--rt-->';

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'A']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT']);

function escapeHtml(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function safeHref(href: string | null | undefined): string | null {
  const h = (href || '').trim();
  return /^(https?:\/\/|mailto:)/i.test(h) ? h : null;
}

function clean(node: Node, out: Node, doc: Document) {
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) { out.appendChild(doc.createTextNode(child.textContent || '')); return; }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    if (DROP.has(el.tagName)) return;
    if (!ALLOWED.has(el.tagName)) { clean(el, out, doc); return; } // tag desconhecida: fica só o conteúdo
    const copy = doc.createElement(el.tagName.toLowerCase());
    if (el.tagName === 'A') {
      const href = safeHref(el.getAttribute('href'));
      if (!href) { clean(el, out, doc); return; }
      copy.setAttribute('href', href);
      copy.setAttribute('target', '_blank');
      copy.setAttribute('rel', 'noopener noreferrer');
    }
    if (el.tagName === 'UL' && el.hasAttribute('data-check')) copy.setAttribute('data-check', '1');
    if (el.tagName === 'LI' && el.hasAttribute('data-done')) copy.setAttribute('data-done', el.getAttribute('data-done') === 'true' ? 'true' : 'false');
    clean(el, copy, doc);
    out.appendChild(copy);
  });
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const box = doc.createElement('div');
  clean(doc.body, box, doc);
  return box.innerHTML;
}

export function bodyToHtml(body: string): string {
  if (!body) return '';
  if (body.startsWith(RT_MARK)) return sanitizeHtml(body.slice(RT_MARK.length));
  return escapeHtml(body).replace(/\r?\n/g, '<br>');
}

// HTML do editor -> corpo para salvar ('' quando está vazio).
export function htmlToBody(html: string): string {
  const safe = sanitizeHtml(html);
  const probe = new DOMParser().parseFromString(`<body>${safe}</body>`, 'text/html').body;
  if (!(probe.textContent || '').trim() && !probe.querySelector('li')) return '';
  return RT_MARK + safe;
}

// Texto simples (prévia na lista e busca).
export function bodyToText(body: string): string {
  if (!body) return '';
  if (!body.startsWith(RT_MARK)) return body;
  const spaced = body.slice(RT_MARK.length).replace(/<(br|\/p|\/div|\/li|\/h[1-3])\b[^>]*>/gi, ' ');
  const doc = new DOMParser().parseFromString(`<body>${spaced}</body>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}
