const { getPool } = require('../db/pool');
const cipaRepo = require('../repositories/cipa.repository');
const { onlyDigits, isValidCpf } = require('../utils/cpf');
const mail = require('./cipa-mail.service');

function httpError(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

function emailValido(raw) {
  const email = String(raw || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email.slice(0, 200);
}

function resolverParticipante(evento, user, body) {
  if (user) {
    const nome = (user.nome_completo || user.nome || '').trim().slice(0, 200);
    const email = (user.email || '').trim().slice(0, 200);
    if (!nome || !email) {
      throw httpError(400, 'Seu cadastro não tem nome ou e-mail suficientes para a inscrição.');
    }
    return { nome, email, usuarioId: user.id };
  }

  if (!evento.link_publico) {
    throw httpError(403, 'Este evento exige autenticação para inscrição.');
  }
  const nome = String(body.nome || '').trim().slice(0, 200);
  const email = emailValido(body.email);
  if (nome.length < 2 || !email) {
    throw httpError(400, 'Informe nome e e-mail válidos.');
  }
  return { nome, email, usuarioId: null };
}

async function inscrever(evento, slotId, user, body) {
  const payload = body && typeof body === 'object' ? body : { cpf: body };
  const cpf = onlyDigits(payload.cpf);
  if (!isValidCpf(cpf)) {
    throw httpError(400, 'CPF inválido.');
  }
  if (evento.estado === 'encerrado') {
    throw httpError(400, 'Este evento está encerrado e não aceita inscrições.');
  }

  const { nome, email, usuarioId } = resolverParticipante(evento, user, payload);

  const conn = await getPool().getConnection();
  let inscricaoId;
  let slot;
  try {
    await conn.beginTransaction();
    await conn.execute('SELECT id FROM cipa_evento_slots WHERE evento_id = ? FOR UPDATE', [
      evento.id,
    ]);
    slot = await cipaRepo.lockSlot(conn, slotId);
    if (!slot || Number(slot.evento_id) !== Number(evento.id)) {
      throw httpError(400, 'Horário inválido para este evento.');
    }
    if (slot.vagas_restantes <= 0) {
      throw httpError(409, 'Não há vagas restantes neste horário.');
    }
    if (await cipaRepo.cpfJaInscritoNoEvento(conn, evento.id, cpf)) {
      throw httpError(409, 'Este CPF já está inscrito neste evento.');
    }
    inscricaoId = await cipaRepo.inserirInscricao(conn, {
      slot_id: slot.id,
      usuario_id: usuarioId,
      nome_completo: nome,
      email,
      cpf,
    });
    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (err.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'Este CPF já está inscrito neste horário.');
    }
    throw err;
  } finally {
    conn.release();
  }

  const inscricao = {
    id: inscricaoId,
    slot_id: slot.id,
    usuario_id: usuarioId,
    nome_completo: nome,
    email,
    cpf,
  };

  const mailResult = await mail.enviarConfirmacao({ evento, slot, inscricao });
  return {
    ok: true,
    message: 'Inscrição confirmada.',
    inscricao_id: inscricaoId,
    email_enviado: !!mailResult.enviado,
  };
}

module.exports = { inscrever };
