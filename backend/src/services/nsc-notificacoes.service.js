const nscRepo = require('../repositories/nsc.repository');
const nscService = require('./nsc.service');
const tenantsRepo = require('../repositories/tenants.repository');
const graphService = require('./graph.service');
const { sendEmail } = require('../utils/emailSender');
const { hojeIso } = require('../utils/nsc-status.util');
const {
  colaboradorHtml,
  gestorHtml,
  resumoRhHtml,
  textoPlano,
} = require('../utils/nsc-email-html.util');

const managerCache = new Map();

function isSegunda(iso = hojeIso()) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() === 1;
}

async function enviarComLog({ adObjectId, tipo, destinatario, subject, html }) {
  if (!destinatario) return { ok: false, motivo: 'sem_destinatario' };
  if (await nscRepo.jaEnviouHoje(adObjectId, tipo, destinatario)) {
    return { ok: false, motivo: 'duplicado_hoje' };
  }
  try {
    await sendEmail({ to: destinatario, subject, html, text: textoPlano(html) });
    await nscRepo.registrarNotificacao({
      adObjectId,
      tipo,
      destinatario,
      status: 'enviado',
    });
    return { ok: true };
  } catch (err) {
    await nscRepo.registrarNotificacao({
      adObjectId,
      tipo,
      destinatario,
      status: 'erro',
    });
    console.error('[nsc.notif] Falha ao enviar:', err.message);
    return { ok: false, motivo: err.message };
  }
}

async function resolverGestor(colab) {
  if (!colab?.ad_object_id) return null;
  if (managerCache.has(colab.ad_object_id)) {
    return managerCache.get(colab.ad_object_id);
  }
  if (!colab.tenant_id) {
    managerCache.set(colab.ad_object_id, null);
    return null;
  }
  try {
    const tenant = await tenantsRepo.findById(colab.tenant_id);
    if (!tenant) {
      managerCache.set(colab.ad_object_id, null);
      return null;
    }
    const manager = await graphService.getUserManager(tenant, colab.ad_object_id);
    managerCache.set(colab.ad_object_id, manager);
    return manager;
  } catch (err) {
    console.error('[nsc.notif] Gestor Graph:', err.message);
    managerCache.set(colab.ad_object_id, null);
    return null;
  }
}

function limiarAtivo(dias, antecedencias) {
  if (dias == null || dias < 0) return null;
  const sorted = [...antecedencias].sort((a, b) => a - b);
  let match = null;
  for (const t of sorted) {
    if (dias <= t) {
      match = t;
      break;
    }
  }
  return match;
}

async function processarColaborador(colab, config) {
  const resumo = { colaborador: 0, gestor: 0 };
  const desde = colab.atualizado_em || null;

  if (config.notificar_colaborador && colab.email) {
    if (colab.status === 'vencido') {
      const tipo = 'vencido';
      if (!(await nscRepo.jaEnviouDesde(colab.ad_object_id, tipo, colab.email, desde))) {
        const html = colaboradorHtml({
          nome: colab.nome,
          status: colab.status,
          validade: colab.validade_efetiva,
          dias: colab.dias_restantes,
        });
        const r = await enviarComLog({
          adObjectId: colab.ad_object_id,
          tipo,
          destinatario: colab.email,
          subject: 'Não se Cale — certificado vencido',
          html,
        });
        if (r.ok) resumo.colaborador += 1;
      }
    } else if (colab.status === 'a_vencer') {
      const limiar = limiarAtivo(colab.dias_restantes, config.antecedencias_aviso);
      if (limiar != null) {
        const tipo = `antecedencia_${limiar}`;
        if (!(await nscRepo.jaEnviouDesde(colab.ad_object_id, tipo, colab.email, desde))) {
          const html = colaboradorHtml({
            nome: colab.nome,
            status: colab.status,
            validade: colab.validade_efetiva,
            dias: colab.dias_restantes,
          });
          const r = await enviarComLog({
            adObjectId: colab.ad_object_id,
            tipo,
            destinatario: colab.email,
            subject: `Não se Cale — certificado vence em ${colab.dias_restantes} dia(s)`,
            html,
          });
          if (r.ok) resumo.colaborador += 1;
        }
      }
    }
  }

  if (
    config.notificar_gestor &&
    (colab.status === 'a_vencer' || colab.status === 'vencido')
  ) {
    const destinos = [];
    const vistos = new Set();
    const acrescentar = (pessoa) => {
      const email = String(pessoa?.email || '').trim().toLowerCase();
      if (!email || vistos.has(email)) return;
      vistos.add(email);
      destinos.push({ email, nome: pessoa.nome || null });
    };
    const doDepto = await nscRepo.listGestoresPorDepartamento(colab.departamento);
    for (const g of doDepto) acrescentar(g);
    acrescentar(await resolverGestor(colab));

    const tipo = colab.status === 'vencido' ? 'gestor_vencido' : 'gestor_a_vencer';
    for (const dest of destinos) {
      if (await nscRepo.jaEnviouDesde(colab.ad_object_id, tipo, dest.email, desde)) continue;
      const html = gestorHtml({
        gestorNome: dest.nome,
        colaboradorNome: colab.nome,
        status: colab.status,
        validade: colab.validade_efetiva,
      });
      const r = await enviarComLog({
        adObjectId: colab.ad_object_id,
        tipo,
        destinatario: dest.email,
        subject: `Não se Cale — ${colab.nome} com certificado ${colab.status === 'vencido' ? 'vencido' : 'a vencer'}`,
        html,
      });
      if (r.ok) resumo.gestor += 1;
    }
  }

  return resumo;
}

async function enviarResumoRh(config, lista) {
  const emails = config.emails_rh || [];
  if (!emails.length) return 0;
  const kpis = {
    obrigatorios: lista.length,
    validos: lista.filter((c) => c.status === 'valido').length,
    a_vencer: lista.filter((c) => c.status === 'a_vencer').length,
    vencidos: lista.filter((c) => c.status === 'vencido').length,
    pendentes: lista.filter((c) => c.status === 'pendente').length,
  };
  const destaques = lista.filter((c) =>
    ['pendente', 'a_vencer', 'vencido'].includes(c.status)
  );
  const html = resumoRhHtml({ kpis, destaques });
  let enviados = 0;
  for (const to of emails) {
    const r = await enviarComLog({
      adObjectId: 'rh',
      tipo: 'resumo_rh',
      destinatario: to,
      subject: 'Não se Cale — resumo semanal de pendências',
      html,
    });
    if (r.ok) enviados += 1;
  }
  return enviados;
}

async function executarJob() {
  managerCache.clear();
  const config = await nscRepo.getConfig();
  const lista = await nscService.listarColaboradores({ somente_obrigatorios: '1' });
  const totais = { colaboradores: 0, gestores: 0, resumo_rh: 0, avaliados: lista.length };

  for (const colab of lista) {
    const r = await processarColaborador(colab, config);
    totais.colaboradores += r.colaborador;
    totais.gestores += r.gestor;
  }

  if (config.resumo_semanal_rh && isSegunda()) {
    totais.resumo_rh = await enviarResumoRh(config, lista);
  }

  return totais;
}

module.exports = { executarJob };
