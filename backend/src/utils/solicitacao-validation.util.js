const { listarCampos, isChaveValida, CHAVES_SENSIVEIS } = require('../config/solicitacao-campos');
const { parseDate } = require('./parse-date.util');
const { isDominioAlertaPermitido } = require('./camarotes-email-domains.util');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function validarCpf(cpf) {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === Number(digits[10]);
}

function validarEmail(email) {
  return EMAIL_RE.test(String(email || '').trim());
}

function parseBool(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  const s = String(value || '').trim().toLowerCase();
  if (s === 'sim' || s === 'true' || s === 'yes') return true;
  if (s === 'nao' || s === 'não' || s === 'false' || s === 'no') return false;
  return null;
}

function erroValidacao(mensagem) {
  const err = new Error(mensagem);
  err.status = 400;
  return err;
}

function validarCamposGrupo(campos) {
  if (!Array.isArray(campos) || !campos.length) {
    throw erroValidacao('Selecione ao menos um campo para o grupo.');
  }
  for (const chave of campos) {
    if (!isChaveValida(chave)) {
      throw erroValidacao(`Campo inválido no grupo: ${chave}`);
    }
  }
  return [...new Set(campos)];
}

function validarGrupoSensivel(campos, destinatarios) {
  const temSensivel = campos.some((c) => CHAVES_SENSIVEIS.has(c));
  if (!temSensivel) return;
  for (const email of destinatarios) {
    if (!isDominioAlertaPermitido(email)) {
      throw erroValidacao(
        `Grupo inclui dados sensíveis e contém e-mail externo não permitido: ${email}`
      );
    }
  }
}

function validarPayload(body, files = {}) {
  const erros = [];
  const out = {};

  const credencialEstacionamento = parseBool(body.credencial_estacionamento) === true;
  out.credencial_estacionamento = credencialEstacionamento;

  for (const campo of listarCampos()) {
    const { chave, tipo, obrigatorio } = campo;

    if (tipo === 'file') {
      if (chave === 'credencial_veiculo') {
        if (credencialEstacionamento && !files.credencial_veiculo) {
          erros.push('Credencial do veículo é obrigatória quando estacionamento = Sim.');
        }
        continue;
      }
      continue;
    }

    const raw = body[chave];
    const vazio = raw == null || String(raw).trim() === '';

    if (campo.condicional) {
      const condVal = parseBool(body[campo.condicional.quando]);
      if (condVal !== campo.condicional.valor) continue;
    }

    if (obrigatorio && vazio) {
      erros.push(`${campo.label} é obrigatório.`);
      continue;
    }
    if (vazio) {
      out[chave] = null;
      continue;
    }

    if (tipo === 'email') {
      if (!validarEmail(raw)) erros.push(`${campo.label} inválido.`);
      else out[chave] = String(raw).trim().toLowerCase();
    } else if (tipo === 'cpf') {
      if (!validarCpf(raw)) erros.push('CPF inválido.');
      else out[chave] = onlyDigits(raw);
    } else if (tipo === 'date') {
      const parsed = parseDate(raw);
      if (!parsed) erros.push(`${campo.label} inválida. Use DD/MM/AAAA ou AAAA-MM-DD.`);
      else out[chave] = parsed;
    } else if (tipo === 'bool') {
      const b = parseBool(raw);
      if (b === null) erros.push(`${campo.label} inválido.`);
      else out[chave] = b;
    } else if (tipo === 'enum') {
      const val = String(raw).trim();
      const ok = campo.opcoes?.some((o) => o.valor === val);
      if (!ok) erros.push(`${campo.label} inválido.`);
      else out[chave] = val;
    } else {
      out[chave] = String(raw).trim();
    }
  }

  if (!out.solicitante) erros.push('Solicitante é obrigatório.');
  if (!out.solicitante_email) erros.push('E-mail do solicitante é obrigatório.');
  else if (!validarEmail(out.solicitante_email)) erros.push('E-mail do solicitante inválido.');
  if (!out.nome) erros.push('Nome é obrigatório.');
  if (!out.sobrenome) erros.push('Sobrenome é obrigatório.');
  if (!out.nome_completo) erros.push('Nome completo é obrigatório.');
  if (!out.tipo) erros.push('Tipo é obrigatório.');
  if (!out.equipamento) erros.push('Equipamento é obrigatório.');

  if (out.email_novo && !validarEmail(out.email_novo)) {
    erros.push('E-mail do novo colaborador inválido.');
  }
  if (out.cpf && !validarCpf(out.cpf)) {
    erros.push('CPF inválido.');
  }

  if (erros.length) {
    throw erroValidacao(erros[0]);
  }

  return out;
}

function encodeBlobRef(container, blobName) {
  return `${container}/${blobName}`;
}

function decodeBlobRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const idx = ref.indexOf('/');
  if (idx <= 0) return null;
  return { container: ref.slice(0, idx), blobName: ref.slice(idx + 1) };
}

module.exports = {
  validarCpf,
  validarEmail,
  parseBool,
  validarPayload,
  validarCamposGrupo,
  validarGrupoSensivel,
  encodeBlobRef,
  decodeBlobRef,
  onlyDigits,
};
