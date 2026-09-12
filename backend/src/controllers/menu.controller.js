const menuRepo = require('../repositories/menu.repository');
const menuSync = require('../services/doc-pagina-menu.sync');
const contentVersionService = require('../services/content-version.service');
const { isValidMenuUrl, normalizeMenuUrl } = require('../utils/menu.validation');
const { MAX_DEPTH, getDepth, isDescendant } = require('../utils/menu.tree');
const { usuarioPodeVisualizar } = require('../services/camarotes-acesso.service');
const { usuarioPodeVisualizar: usuarioPodeVisualizarSolicitacao } = require('../services/solicitacao-acesso.service');

const CAMAROTES_BI_URL = '/bi/camarotes';
const SOLICITACAO_COLABORADOR_URL = '/solicitacao-colaborador';
const RUSTDESK_URL = '/ti/rustdesk';

function filterUrlFromTree(nodes, url) {
  const result = [];
  for (const node of nodes) {
    const children = filterUrlFromTree(node.children || [], url);
    if (node.url === url) continue;
    result.push({ ...node, children });
  }
  return result;
}

function pruneParentIfEmpty(nodes, label) {
  return nodes
    .filter((node) => {
      if (node.label === label && !node.url && !(node.children && node.children.length)) {
        return false;
      }
      return true;
    })
    .map((node) => ({
      ...node,
      children: pruneParentIfEmpty(node.children || [], label),
    }));
}

async function validateParent(parentId, selfId = null) {
  if (parentId == null || parentId === '') return null;
  const pid = Number(parentId);
  if (selfId != null && pid === selfId) {
    throw new Error('Item não pode ser pai de si mesmo.');
  }
  const parent = await menuRepo.findById(pid);
  if (!parent) {
    throw new Error('Item pai não encontrado.');
  }
  if (selfId != null && (await isDescendant(selfId, pid))) {
    throw new Error('Item não pode ser pai de um descendente.');
  }
  const parentDepth = await getDepth(pid);
  if (parentDepth + 1 > MAX_DEPTH) {
    throw new Error(`Profundidade máxima do menu é ${MAX_DEPTH} níveis.`);
  }
  return pid;
}

function parseBody(body) {
  const url = normalizeMenuUrl(body.url);
  if (!isValidMenuUrl(url)) {
    throw new Error('URL inválida. Use http(s)://, caminho interno (/...) ou deixe vazio.');
  }
  return {
    label: body.label?.trim(),
    url,
    parent_id: body.parent_id === '' || body.parent_id == null ? null : Number(body.parent_id),
    ordem: body.ordem != null ? Number(body.ordem) : 0,
    abrir_nova_aba: body.abrir_nova_aba !== false,
    icone: body.icone?.trim() || null,
    cabecalho: body.cabecalho?.trim() || null,
    ativo: body.ativo !== false,
    visivel_perfil: body.visivel_perfil?.trim() || null,
  };
}

async function getPublicTree(req, res) {
  const rows = await menuRepo.findAllFlat();
  let tree = menuRepo.buildTree(rows, {
    filterActive: true,
    perfil: req.user.perfil,
    includeAdminFields: false,
  });

  const podeVisualizarCamarotes = await usuarioPodeVisualizar(req.user, req.userModulos || []);
  if (!podeVisualizarCamarotes) {
    tree = filterUrlFromTree(tree, CAMAROTES_BI_URL);
  }

  const podeVisualizarSolicitacao = await usuarioPodeVisualizarSolicitacao(
    req.user,
    req.userModulos || []
  );
  if (!podeVisualizarSolicitacao) {
    tree = filterUrlFromTree(tree, SOLICITACAO_COLABORADOR_URL);
  }

  const podeRustdesk =
    req.user?.perfil === 'ADMIN' || (req.userModulos || []).includes('rustdesk');
  if (!podeRustdesk) {
    tree = filterUrlFromTree(tree, RUSTDESK_URL);
    tree = pruneParentIfEmpty(tree, 'TI');
  }

  return res.json(tree);
}

async function getAdminTree(_req, res) {
  const rows = await menuRepo.findAllFlat();
  const tree = menuRepo.buildTree(rows, { includeAdminFields: true });
  return res.json(tree);
}

async function create(req, res) {
  try {
    const data = parseBody(req.body);
    if (!data.label) {
      return res.status(400).json({ mensagem: 'label é obrigatório.' });
    }
    data.parent_id = await validateParent(data.parent_id);
    const item = await menuRepo.create(data);
    return res.status(201).json(item);
  } catch (err) {
    return res.status(400).json({ mensagem: err.message });
  }
}

async function update(req, res) {
  try {
    const id = Number(req.params.id);
    const existing = await menuRepo.findById(id);
    if (!existing) {
      return res.status(404).json({ mensagem: 'Item não encontrado.' });
    }

    const data = parseBody({ ...existing, ...req.body });
    if (!data.label) {
      return res.status(400).json({ mensagem: 'label é obrigatório.' });
    }
    if (req.body.parent_id !== undefined) {
      data.parent_id = await validateParent(data.parent_id, id);
    } else {
      data.parent_id = existing.parent_id;
    }

    const item = await menuRepo.update(id, data);
    await contentVersionService.bump('menu');
    return res.json(item);
  } catch (err) {
    return res.status(400).json({ mensagem: err.message });
  }
}

async function remove(req, res) {
  const id = Number(req.params.id);
  const existing = await menuRepo.findById(id);
  if (!existing) {
    return res.status(404).json({ mensagem: 'Item não encontrado.' });
  }
  await menuRepo.remove(id);
  await contentVersionService.bump('menu');
  return res.json({ ok: true });
}

async function reorder(req, res) {
  try {
    const items = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ mensagem: 'Envie um array de { id, parent_id, ordem }.' });
    }

    for (const item of items) {
      if (!item.id || item.ordem == null) {
        return res.status(400).json({ mensagem: 'Cada item precisa de id e ordem.' });
      }
      const existing = await menuRepo.findById(Number(item.id));
      if (!existing) {
        return res.status(400).json({ mensagem: `Item ${item.id} não encontrado.` });
      }
      const sentParent = item.parent_id == null ? null : Number(item.parent_id);
      const currentParent = existing.parent_id == null ? null : Number(existing.parent_id);
      if (sentParent !== currentParent) {
        return res.status(400).json({
          mensagem: 'Reordenação não pode alterar o item pai. Use o campo "Item pai" no formulário.',
        });
      }
    }

    const normalized = items.map((i) => ({
      id: Number(i.id),
      parent_id: i.parent_id == null ? null : Number(i.parent_id),
      ordem: Number(i.ordem),
    }));

    await menuRepo.reorderBatch(normalized);
    await menuSync.syncMenuOrdemToPaginas(normalized);
    await contentVersionService.bump('menu');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ mensagem: err.message });
  }
}

module.exports = { getPublicTree, getAdminTree, create, update, remove, reorder };
