const repo = require('../repositories/rustdesk.repository');
const bridge = require('./rustdesk-bridge.client');

let syncEmAndamento = false;

async function sincronizar() {
  if (syncEmAndamento) {
    const err = new Error('Sincronização RustDesk já em andamento.');
    err.status = 409;
    throw err;
  }

  syncEmAndamento = true;
  const iniciadoEm = new Date();

  try {
    const peersRes = await bridge.getPeers();
    if (peersRes.status !== 200 || !Array.isArray(peersRes.body?.peers)) {
      const msg =
        peersRes.body?.mensagem ||
        (peersRes.erroRede
          ? 'Falha de rede ao consultar o bridge.'
          : `Bridge retornou ${peersRes.status || 'erro'} em /peers.`);
      const log = await repo.insertSyncLog({
        sucesso: false,
        peersLidos: 0,
        dispositivosAtualizados: 0,
        orfaosNovos: 0,
        mensagemErro: msg,
        iniciadoEm,
      });
      console.error('[rustdesk.sync] Falha:', msg);
      return { ok: false, mensagem: msg, log };
    }

    const peers = peersRes.body.peers;
    const cadastrados = await repo.listIdsCadastrados();

    await repo.marcarTodosAusentesHbbs();

    let dispositivosAtualizados = 0;
    let orfaosNovos = 0;

    for (const peer of peers) {
      const rustdeskId = String(peer?.rustdeskId ?? '');
      if (!rustdeskId) continue;

      if (cadastrados.has(rustdeskId)) {
        const n = await repo.atualizarDoPeer(rustdeskId, {
          criadoEm: peer.criadoEm,
          ultimoRegistro: peer.ultimoRegistro,
        });
        dispositivosAtualizados += n;
        await repo.removeOrfao(rustdeskId);
      } else {
        const isNew = await repo.upsertOrfao({
          rustdeskId,
          criadoEm: peer.criadoEm,
          ultimoRegistro: peer.ultimoRegistro,
        });
        if (isNew) orfaosNovos += 1;
      }
    }

    const log = await repo.insertSyncLog({
      sucesso: true,
      peersLidos: peers.length,
      dispositivosAtualizados,
      orfaosNovos,
      mensagemErro: null,
      iniciadoEm,
    });

    console.log(
      `[rustdesk.sync] OK — ${peers.length} peer(s), ${dispositivosAtualizados} atualizado(s), ${orfaosNovos} órfão(s) novo(s).`
    );

    return {
      ok: true,
      mensagem: `Sincronização concluída. ${peers.length} peer(s) lidos.`,
      log,
    };
  } catch (err) {
    const msg = err.message || 'Erro ao sincronizar RustDesk.';
    const log = await repo
      .insertSyncLog({
        sucesso: false,
        mensagemErro: msg,
        iniciadoEm,
      })
      .catch(() => null);
    console.error('[rustdesk.sync] Falha:', msg);
    if (err.status === 409) throw err;
    return { ok: false, mensagem: msg, log };
  } finally {
    syncEmAndamento = false;
  }
}

module.exports = { sincronizar };
