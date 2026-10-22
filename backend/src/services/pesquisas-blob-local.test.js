const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const local = require('./pesquisas-blob-local');

describe('pesquisas-blob-local', () => {
  it('rejeita path traversal e monta URL relativa', () => {
    assert.equal(local.safeName('../secret.png'), null);
    assert.equal(local.safeName('capa.jpg'), null);
    assert.equal(local.safeName('a/b/c.png'), null);
    const nome = `${crypto.randomUUID()}.png`;
    assert.equal(local.safeName(nome), nome);
    assert.equal(local.publicUrl(nome), `/api/v1/pesquisas/local-blob/${nome}`);
    assert.equal(local.contentTypeOf(nome), 'image/png');
    const sas = local.sasLocal(nome);
    assert.equal(sas.url, `/api/v1/pesquisas/local-blob/${nome}`);
    assert.ok(sas.expiraEm);
  });

  it('grava e lê buffer utf8 no disco, sem Azure', async () => {
    const nome = `${crypto.randomUUID()}.png`;
    const payload = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    try {
      await local.salvarBuffer(nome, payload, 'image/png');
      const lido = await local.ler(nome);
      assert.equal(lido.contentType, 'image/png');
      assert.deepEqual(lido.buffer, payload);
      assert.equal(lido.filename, nome);
      assert.equal(fs.existsSync(lido.path), true);
      assert.equal(path.dirname(lido.path), local.dir());
    } finally {
      await local.remover(nome);
      assert.equal(fs.existsSync(path.join(local.dir(), nome)), false);
    }
  });
});
