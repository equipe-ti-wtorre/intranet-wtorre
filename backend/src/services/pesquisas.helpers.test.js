const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const {
  sanitizeErroMensagem,
  lookupKeysFromValor,
  temChaveLookup,
  refFormularioFromRaw,
  buffersParaZip,
  assertConvidadosIdentidade,
  permiteNovaResposta,
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

describe('refFormularioFromRaw', () => {
  it('extrai id do path interno', () => {
    assert.equal(refFormularioFromRaw('/pesquisas/formulario/46/responder'), '46');
  });

  it('extrai slug do path interno', () => {
    assert.equal(
      refFormularioFromRaw('/pesquisas/formulario/MNFGufAyFeZlRFz2OIvgqQ/responder'),
      'MNFGufAyFeZlRFz2OIvgqQ'
    );
  });

  it('decodifica path com barras escaped', () => {
    assert.equal(
      refFormularioFromRaw('pesquisas%2Fformulario%2F46%2Fresponder'),
      '46'
    );
  });

  it('mantém id ou slug simples', () => {
    assert.equal(refFormularioFromRaw('46'), '46');
    assert.equal(refFormularioFromRaw('MNFGufAyFeZlRFz2OIvgqQ'), 'MNFGufAyFeZlRFz2OIvgqQ');
  });
});

describe('buffersParaZip', () => {
  it('gera ZIP com dois arquivos', async () => {
    const zip = await buffersParaZip([
      { nome: 'a.txt', buffer: Buffer.from('um') },
      { nome: 'b.txt', buffer: Buffer.from('dois') },
    ]);
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    assert.ok(zip.length > 80);
  });

  it('rejeita lista vazia', async () => {
    await assert.rejects(() => buffersParaZip([]), (err) => err.status === 404);
  });
});

describe('assertConvidadosIdentidade', () => {
  it('permite 0 convidados quando a identidade está desligada', () => {
    assert.doesNotThrow(() =>
      assertConvidadosIdentidade({
        publicoAlvo: 'externos',
        exigirIdentidade: false,
        count: 0,
        publicar: true,
      })
    );
  });

  it('exige convidado ao publicar com identidade ligada', () => {
    assert.throws(
      () =>
        assertConvidadosIdentidade({
          publicoAlvo: 'externos',
          exigirIdentidade: true,
          count: 0,
          publicar: true,
        }),
      (err) =>
        err.status === 400 &&
        err.message === 'Inclua ao menos um convidado para exigir a confirmação de identidade.'
    );
  });

  it('não exige convidado em rascunho', () => {
    assert.doesNotThrow(() =>
      assertConvidadosIdentidade({
        publicoAlvo: 'externos',
        exigirIdentidade: true,
        count: 0,
        publicar: false,
      })
    );
  });
});

const { toJsonBind } = require('../repositories/pesquisas.repository');

describe('toJsonBind', () => {
  it('stringify de array e objeto vira string utf8, não Buffer', () => {
    const arr = toJsonBind([]);
    const obj = toJsonBind({ a: 1 });
    assert.equal(typeof arr, 'string');
    assert.equal(arr, '[]');
    assert.equal(typeof obj, 'string');
    assert.equal(obj, '{"a":1}');
    assert.equal(Buffer.isBuffer(arr), false);
    assert.equal(Buffer.isBuffer(obj), false);
    assert.equal(Buffer.byteLength(arr, 'utf8'), arr.length);
  });

  it('null e undefined não viram Buffer', () => {
    assert.equal(toJsonBind(null), null);
    assert.equal(toJsonBind(undefined), null);
    assert.equal(Buffer.isBuffer(toJsonBind(null)), false);
  });
});

describe('permiteNovaResposta', () => {
  it('bloqueia segunda resposta quando a flag está desligada', () => {
    assert.equal(permiteNovaResposta({ multiplaResposta: false }, { id: 1 }), false);
    assert.equal(permiteNovaResposta({}, { id: 1 }), false);
  });

  it('libera segunda resposta quando a flag está ligada', () => {
    assert.equal(permiteNovaResposta({ multiplaResposta: true }, { id: 1 }), true);
  });

  it('sempre libera a primeira resposta', () => {
    assert.equal(permiteNovaResposta({ multiplaResposta: false }, null), true);
    assert.equal(permiteNovaResposta({ multiplaResposta: true }, null), true);
  });
});
