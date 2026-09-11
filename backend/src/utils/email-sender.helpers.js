const ACS_LIMITS = {
  perMinute: 30,
  perHour: 100,
  perDay: 2400,
};

/** Cota reservada para e-mail transacional (priority=high). O disparo usa o restante. */
const ACS_RESERVE = {
  perMinute: 5,
  perHour: 15,
};

const ACS_WINDOWS = [
  {
    key: 'perMinute',
    ms: 60 * 1000,
    label: 'Limite ACS: 30 e-mails/min',
    bulkLabel: 'Limite ACS: cota de disparo (25 e-mails/min; 5 reservados para transacional)',
  },
  {
    key: 'perHour',
    ms: 60 * 60 * 1000,
    label: 'Limite ACS: 100 e-mails/h',
    bulkLabel: 'Limite ACS: cota de disparo (85 e-mails/h; 15 reservados para transacional)',
  },
  {
    key: 'perDay',
    ms: 24 * 60 * 60 * 1000,
    label: 'Limite ACS: 2400 e-mails/dia',
    bulkLabel: 'Limite ACS: 2400 e-mails/dia',
  },
];

/** @type {{ ts: number, priority: 'high' | 'normal' }[]} */
const acsSendTimestamps = [];

const pendingHigh = [];
const pendingNormal = [];

let pumping = false;
let wakeSleep = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function inferContentType(filename) {
  const ext = String(filename || '')
    .toLowerCase()
    .split('.')
    .pop();
  const map = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    html: 'text/html',
    htm: 'text/html',
    txt: 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

function toBase64Content(content) {
  if (Buffer.isBuffer(content)) return content.toString('base64');
  return Buffer.from(String(content), 'utf8').toString('base64');
}

function entryTs(entry) {
  return typeof entry === 'number' ? entry : entry.ts;
}

function entryPriority(entry) {
  if (typeof entry === 'number') return 'normal';
  return entry.priority === 'high' ? 'high' : 'normal';
}

function pruneTimestamps(now) {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  while (acsSendTimestamps.length && entryTs(acsSendTimestamps[0]) < dayAgo) {
    acsSendTimestamps.shift();
  }
}

function countInWindow(now, windowMs, onlyPriority) {
  const cutoff = now - windowMs;
  let count = 0;
  for (let i = acsSendTimestamps.length - 1; i >= 0; i -= 1) {
    const entry = acsSendTimestamps[i];
    if (entryTs(entry) < cutoff) break;
    if (onlyPriority && entryPriority(entry) !== onlyPriority) continue;
    count += 1;
  }
  return count;
}

function oldestInWindow(now, windowMs, onlyPriority) {
  const cutoff = now - windowMs;
  for (let i = 0; i < acsSendTimestamps.length; i += 1) {
    const entry = acsSendTimestamps[i];
    if (entryTs(entry) < cutoff) continue;
    if (onlyPriority && entryPriority(entry) !== onlyPriority) continue;
    return entryTs(entry);
  }
  return null;
}

function waitFromOldest(now, windowMs, onlyPriority) {
  const oldest = oldestInWindow(now, windowMs, onlyPriority);
  if (oldest == null) return 0;
  return Math.max(0, oldest + windowMs - now + 50);
}

function estimateAcsWait(priority = 'normal') {
  const now = Date.now();
  pruneTimestamps(now);
  const isHigh = priority === 'high';

  let waitMs = 0;
  let motivo = null;

  for (const win of ACS_WINDOWS) {
    const totalLimit = ACS_LIMITS[win.key];
    const totalCount = countInWindow(now, win.ms);
    if (totalCount >= totalLimit) {
      const needed = waitFromOldest(now, win.ms);
      if (needed > waitMs) {
        waitMs = needed;
        motivo = win.label;
      }
    }

    if (!isHigh && win.key !== 'perDay') {
      const bulkLimit = totalLimit - (ACS_RESERVE[win.key] || 0);
      const bulkCount = countInWindow(now, win.ms, 'normal');
      if (bulkCount >= bulkLimit) {
        const needed = waitFromOldest(now, win.ms, 'normal');
        if (needed > waitMs) {
          waitMs = needed;
          motivo = win.bulkLabel;
        }
      }
    }
  }

  return { waitMs, motivo: waitMs > 0 ? motivo || 'Limite ACS: aguardando janela de envio' : null };
}

function estimateAcsWaitMs(priority = 'normal') {
  return estimateAcsWait(priority).waitMs;
}

function acsWaitMotivo(waitMs, priority = 'normal') {
  if (waitMs <= 0) return null;
  return estimateAcsWait(priority).motivo;
}

function notifyWait(item, { waitMs, motivo }) {
  const reason = motivo || acsWaitMotivo(waitMs, item.priority);
  if (typeof item.onWait === 'function') {
    item.onWait(Date.now() + waitMs, waitMs, reason);
  }

  const now = Date.now();
  if (item.loggedWaitAt && now - item.loggedWaitAt < 15000) return;
  item.loggedWaitAt = now;
  const secs = Math.max(1, Math.ceil(waitMs / 1000));
  const label = item.label ? ` label=${item.label}` : '';
  console.warn(`[email-acs] aguardando ${secs}s (${reason}) priority=${item.priority}${label}`);
}

function grantSlot(item) {
  acsSendTimestamps.push({ ts: Date.now(), priority: item.priority });
  item.resolve();
}

function sleepOrWake(ms) {
  const slice = Math.min(Math.max(ms, 50), 1000);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (wakeSleep === done) wakeSleep = null;
      resolve();
    }, slice);
    const done = () => {
      clearTimeout(timer);
      wakeSleep = null;
      resolve();
    };
    wakeSleep = done;
  });
}

function wakePump() {
  if (typeof wakeSleep === 'function') {
    const fn = wakeSleep;
    wakeSleep = null;
    fn();
  }
}

async function pumpAcsQueue() {
  if (pumping) {
    wakePump();
    return;
  }
  pumping = true;
  try {
    while (pendingHigh.length || pendingNormal.length) {
      if (pendingHigh.length) {
        const highWait = estimateAcsWait('high');
        if (highWait.waitMs <= 0) {
          grantSlot(pendingHigh.shift());
          continue;
        }
        notifyWait(pendingHigh[0], highWait);
        await sleepOrWake(highWait.waitMs);
        continue;
      }

      const normalWait = estimateAcsWait('normal');
      if (normalWait.waitMs <= 0) {
        grantSlot(pendingNormal.shift());
        continue;
      }
      notifyWait(pendingNormal[0], normalWait);
      await sleepOrWake(normalWait.waitMs);
    }
  } finally {
    pumping = false;
    if (pendingHigh.length || pendingNormal.length) {
      void pumpAcsQueue();
    }
  }
}

/**
 * Serializa envios ACS e respeita tetos Azure.
 * `priority: 'high'` (transacional) entra na frente do disparo e usa a cota reservada.
 * @param {Function} [onWait]
 * @param {{ priority?: 'high' | 'normal', label?: string }} [options]
 */
function acsRateLimit(onWait, options = {}) {
  const priority = options.priority === 'high' ? 'high' : 'normal';
  const label = options.label ? String(options.label) : '';

  return new Promise((resolve) => {
    const item = { resolve, onWait, priority, label, loggedWaitAt: 0 };
    if (priority === 'high') pendingHigh.push(item);
    else pendingNormal.push(item);
    void pumpAcsQueue();
  });
}

function isSmtpConnectionError(err) {
  const code = err?.code || '';
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EPIPE'].includes(code);
}

function applyHiddenToRecipients(opts, cfg) {
  if (!cfg.email_ocultar_para || !opts?.to) return opts;

  const realTo = opts.to;
  const envelopeTo = cfg.provider === 'acs' ? cfg.acs_sender : cfg.smtp_from;
  const bccList = [];

  if (opts.bcc) {
    const existing = Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc];
    bccList.push(...existing);
  }
  bccList.push(realTo);

  return {
    ...opts,
    to: envelopeTo,
    bcc: bccList.length === 1 ? bccList[0] : bccList,
  };
}

function normalizeRecipients(recipients) {
  return [...new Set(recipients.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
}

const BATCH_THROTTLE = {
  acs: { batchSize: 10, delayItem: 2000, delayBatch: 40000 },
  smtp: { batchSize: 10, delayItem: 1000, delayBatch: 5000 },
};

module.exports = {
  ACS_LIMITS,
  ACS_RESERVE,
  stripHtml,
  inferContentType,
  toBase64Content,
  estimateAcsWaitMs,
  acsWaitMotivo,
  acsRateLimit,
  isSmtpConnectionError,
  applyHiddenToRecipients,
  normalizeRecipients,
  BATCH_THROTTLE,
  sleep,
};
