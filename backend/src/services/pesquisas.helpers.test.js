const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const {
  sanitizeErroMensagem,
  lookupKeysFromValor,
  temChaveLookup,
} = require('./pesquisas.service');

describe('sanitizeErroMensagem', () => {
  it('mascara SAS, AccountKey, senha e URL mysql', () => {
    const msg = sanitizeErroMensagem({
      message:
        'falha https://acct.blob.core.windows.net/c/b?sv=2023&se=x&sig=SECRET AccountKey=abc123; password=hunter2 mysql://u:p@h/db',
    });
    assert.equal(msg.includes('sig=SECRET'), false);
    assert.equal(msg.includes('AccountKey=abc123'), false);
    assert.match(msg, /password=\*\*\*/);
    assert.match(msg, /mysql:\/\/\*\*\*/);
  });

  it('usa mensagem padrão quando vazia', () => {
    assert.equal(sanitizeErroMensagem({ message: '   ' }), 'Erro desconhecido');
    assert.equal(sanitizeErroMensagem({}), 'Erro desconhecido');
  });

  it('limita a 500 caracteres', () => {
    const msg = sanitizeErroMensagem({ message: 'x'.repeat(800) });
    assert.equal(msg.length, 500);
  });
});

describe('lookupKeysFromValor', () => {
  it('reconhece e-mail', () => {
    const k = lookupKeysFromValor('Ana@Grupo.com');
    assert.equal(k.chaveEmail, 'ana@grupo.com');
    assert.equal(k.chaveDoc, null);
    assert.equal(k.chaveRg, null);
    assert.equal(temChaveLookup(k), true);
  });

  it('reconhece CPF', () => {
    const k = lookupKeysFromValor('529.982.247-25');
    assert.equal(typeof k.chaveDoc, 'string');
    assert.equal(k.chaveDoc.length, 64);
    assert.equal(k.chaveEmail, null);
    assert.equal(k.chaveRg, null);
    assert.equal(temChaveLookup(k), true);
  });

  it('reconhece RG', () => {
    const k = lookupKeysFromValor('12.345.678-X');
    assert.equal(typeof k.chaveRg, 'string');
    assert.equal(k.chaveRg.length, 64);
    assert.equal(k.chaveDoc, null);
    assert.equal(k.chaveEmail, null);
    assert.equal(temChaveLookup(k), true);
  });

  it('vazio não tem chave', () => {
    const k = lookupKeysFromValor('');
    assert.equal(temChaveLookup(k), false);
  });
});
