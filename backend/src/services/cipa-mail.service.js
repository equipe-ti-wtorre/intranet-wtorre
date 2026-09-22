const { env } = require('../config/env');
const { sendEmail, NOT_CONFIGURED_MSG } = require('../utils/emailSender');
const { formatCpf } = require('../utils/cpf');

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIcsDate(isoDate, horario, offsetMin = 0) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const [hh, mm] = String(horario || '00:00').split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  dt.setMinutes(dt.getMinutes() + offsetMin);
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

function foldIcs(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return chunks.join('\r\n');
}

function buildIcs({ evento, slot, inscricao }) {
  const uid = `agenda-rh-${evento.id}-${slot.id}-${inscricao.id}@intranet-wtorre`;
  const dtStart = toIcsDate(evento.data, slot.horario);
  const dtEnd = toIcsDate(evento.data, slot.horario, evento.duracao_slot_min || 60);
  const stamp = toIcsDate(
    new Date().toISOString().slice(0, 10),
    `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`
  );
  const summary = (evento.titulo || 'Evento Agenda RH').replace(/[\r\n]/g, ' ');
  const location = (evento.localizacao || '').replace(/[\r\n]/g, ' ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WTorre//Agenda RH//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    foldIcs(`SUMMARY:${summary}`),
  ];
  if (location) lines.push(foldIcs(`LOCATION:${location}`));
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

function wrapHtml(inner) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Segoe UI',Arial,sans-serif;color:#10151f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#1d54e6;color:#fff;padding:18px 24px;font-weight:700;font-size:16px;">
              Agenda RH · Grupo WTorre
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

function formatDataPt(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

async function enviarConfirmacao({ evento, slot, inscricao }) {
  const to = inscricao.email;
  if (!to) return { enviado: false, motivo: 'sem_email' };

  const linkBase = env.publicAppUrl || '';
  const link = linkBase ? `${linkBase}/${evento.codigo}` : '';
  const inner = `
    <p style="margin:0 0 12px;font-size:16px;">Olá, ${inscricao.nome_completo || 'colaborador'}.</p>
    <p style="margin:0 0 12px;color:#48536a;line-height:1.5;">
      Sua inscrição no evento <strong>${evento.titulo}</strong> foi confirmada.
    </p>
    <p style="margin:0 0 12px;color:#48536a;line-height:1.5;">
      <strong>Data:</strong> ${formatDataPt(evento.data)}<br>
      <strong>Horário:</strong> ${slot.horario}<br>
      ${evento.localizacao ? `<strong>Local:</strong> ${evento.localizacao}<br>` : ''}
      <strong>CPF:</strong> ${formatCpf(inscricao.cpf)}
    </p>
    ${
      link
        ? `<p style="margin:16px 0 0;">
      <a href="${link}" style="display:inline-block;background:#1d54e6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;">
        Ver evento
      </a>
    </p>`
        : ''
    }`;

  const ics = buildIcs({ evento, slot, inscricao });

  try {
    await sendEmail({
      to,
      subject: `Inscrição confirmada — ${evento.titulo}`,
      html: wrapHtml(inner),
      text: `Inscrição confirmada no evento ${evento.titulo} em ${formatDataPt(evento.data)} às ${slot.horario}.`,
      attachments: [
        {
          filename: 'evento-agenda-rh.ics',
          content: ics,
          contentType: 'text/calendar; charset=utf-8',
        },
      ],
    });
    return { enviado: true };
  } catch (err) {
    if (err.message === NOT_CONFIGURED_MSG) {
      return { enviado: false, motivo: 'email_nao_configurado' };
    }
    console.error('[cipa] Falha ao enviar e-mail de inscrição:', err.message);
    return { enviado: false, motivo: err.message };
  }
}

module.exports = { enviarConfirmacao, buildIcs };
