const fs = require('fs/promises');
const treinamentosRepo = require('../repositories/treinamentos.repository');
const treinamentoEntidadesRepo = require('../repositories/treinamento-entidades.repository');
const containersRepo = require('../repositories/storage-containers.repository');
const paginaRepo = require('../repositories/documentos-paginas.repository');
const catRepo = require('../repositories/categorias-documentos.repository');
const blobService = require('../services/blob.service');
const contentVersionService = require('../services/content-version.service');
const docRepo = require('../repositories/documentos.repository');
const { validateSetorId } = require('../utils/documentos-setor.validation');
const { resolveVisibilidadesFromBody } = require('../utils/visibilidade-entidades.validation');
const {
  parseDuracaoSeg,
  parseCategoriaId,
  parsePaginaId,
} = require('../utils/treinamento-categoria.validation');

function criadoPor(req) {
  return req.user?.nome_completo || req.user?.nome || req.user?.email || null;
}

async function unlinkSafe(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore */
  }
}

async function validarPaginaAtiva(paginaId) {
  const pagina = await paginaRepo.findById(paginaId);
  if (!pagina || !pagina.ativo) {
    const err = new Error('Página (entidade) inválida ou inativa.');
    err.status = 400;
    throw err;
  }
  return pagina;
}

async function validarCategoriaParaPagina(categoriaId, paginaId) {
  if (categoriaId == null) return null;
  const cat = await catRepo.findById(categoriaId);
  if (!cat || !cat.ativo) {
    const err = new Error('Categoria inválida ou inativa.');
    err.status = 400;
    throw err;
  }
  if (cat.pagina_id !== paginaId) {
    const err = new Error('Categoria deve pertencer à mesma entidade do treinamento.');
    err.status = 400;
    throw err;
  }
  return cat;
}

function parseListOptions(req) {
  const pagina = req.query.pagina?.trim() || req.params.paginaSlug?.trim() || 'wtorre';
  const categoria = req.query.categoria?.trim() || null;
  const semCategoria =
    req.query.sem_categoria === '1' ||
    req.query.sem_categoria === 'true' ||
    categoria === '__sem__';
  return {
    paginaSlug: pagina,
    categoriaSlug: semCategoria ? null : categoria,
    semCategoria,
    setorRef: req.query.setor,
  };
}

async function listar(req, res) {
  try {
    const opts = parseListOptions(req);
    let setorFilter = { type: 'all' };
    if (opts.setorRef !== undefined && opts.setorRef !== '') {
      const resolved = await docRepo.resolveSetorFilter(opts.setorRef);
      if (resolved === null) {
        return res.status(404).json({ mensagem: 'Setor não encontrado.' });
      }
      setorFilter = resolved;
    }
    const lista = await treinamentosRepo.findAllPublico({ ...opts, setorFilter });
    return res.json(lista);
  } catch (err) {
    return res.status(500).json({ mensagem: err.message || 'Erro ao listar treinamentos.' });
  }
}

async function listarPorPagina(req, res) {
  return listar(req, res);
}

async function listarAdmin(req, res) {
  try {
    const paginaId = req.query.pagina_id != null ? Number(req.query.pagina_id) : null;
    const lista = await treinamentosRepo.findAllAdmin({
      paginaId: paginaId && Number.isFinite(paginaId) ? paginaId : null,
    });
    return res.json(lista);
  } catch (err) {
    return res.status(500).json({ mensagem: err.message || 'Erro ao listar treinamentos.' });
  }
}

async function obter(req, res) {
  try {
    const id = Number(req.params.id);
    const row = await treinamentosRepo.findById(id);
    if (!row || (!row.ativo && req.user?.perfil !== 'ADMIN')) {
      return res.status(404).json({ mensagem: 'Treinamento não encontrado.' });
    }

    if (req.user?.perfil === 'ADMIN') {
      return res.json(row);
    }
    return res.json(treinamentosRepo.mapPublico(row));
  } catch (err) {
    return res.status(500).json({ mensagem: err.message || 'Erro ao obter treinamento.' });
  }
}

async function playback(req, res) {
  try {
    const id = Number(req.params.id);
    const row = await treinamentosRepo.findById(id);
    if (!row || !row.ativo) {
      return res.status(404).json({ mensagem: 'Treinamento não encontrado.' });
    }

    const sas = await blobService.gerarSasLeitura(row.container, row.blob_name);
    return res.json(sas);
  } catch (err) {
    return res.status(err.status || 500).json({
      mensagem: err.message || 'Erro ao gerar URL de playback.',
    });
  }
}

async function thumb(req, res) {
  try {
    const id = Number(req.params.id);
    const row = await treinamentosRepo.findById(id);
    if (!row || !row.ativo || !row.thumb_blob) {
      return res.status(404).json({ mensagem: 'Thumbnail não encontrada.' });
    }

    const sas = await blobService.gerarSasLeitura(row.container, row.thumb_blob);
    return res.json(sas);
  } catch (err) {
    return res.status(err.status || 500).json({
      mensagem: err.message || 'Erro ao gerar URL da thumbnail.',
    });
  }
}

async function thumbStream(req, res) {
  try {
    const id = Number(req.params.id);
    const row = await treinamentosRepo.findById(id);
    if (!row || !row.ativo || !row.thumb_blob) {
      return res.status(404).json({ mensagem: 'Thumbnail não encontrada.' });
    }

    const { buffer, contentType } = await blobService.baixarBuffer(row.container, row.thumb_blob);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(buffer);
  } catch (err) {
    return res.status(err.status || 500).json({
      mensagem: err.message || 'Erro ao carregar thumbnail.',
    });
  }
}

async function resolverContainer(nomeForm) {
  if (nomeForm?.trim()) {
    const c = await containersRepo.findByNome(nomeForm.trim().toLowerCase());
    if (!c || !c.ativo) {
      const err = new Error('Container inválido ou inativo.');
      err.status = 400;
      throw err;
    }
    return c.nome;
  }
  const padrao = await containersRepo.containerPadrao();
  if (!padrao) {
    const err = new Error('Nenhum container padrão configurado.');
    err.status = 400;
    throw err;
  }
  return padrao.nome;
}

async function criar(req, res) {
  const videoFile = req.files?.video?.[0];
  const thumbFile = req.files?.thumb?.[0];
  let uploadedVideo = null;
  let uploadedThumb = null;
  let container = null;

  try {
    if (!videoFile) {
      return res.status(400).json({ mensagem: 'Arquivo de vídeo é obrigatório.' });
    }

    const titulo = req.body.titulo?.trim();
    if (!titulo) {
      return res.status(400).json({ mensagem: 'titulo é obrigatório.' });
    }

    let visibilidades;
    try {
      // Frontend envia só `visibilidades`; pagina_id legado só se vier com valor útil.
      // String vazia no multipart NÃO deve disparar parsePaginaId ("pagina_id é obrigatório").
      const hasLegacyPagina =
        (req.body.pagina_id != null && String(req.body.pagina_id).trim() !== '') ||
        (req.body.paginaId != null && String(req.body.paginaId).trim() !== '');
      const legacyPaginaId = hasLegacyPagina ? parsePaginaId(req.body) : null;
      let legacyCategoriaId = null;
      if (req.body.categoria_id !== undefined || req.body.categoriaId !== undefined) {
        legacyCategoriaId = parseCategoriaId(req.body);
      }
      visibilidades = await resolveVisibilidadesFromBody(
        req.body,
        legacyPaginaId,
        legacyCategoriaId,
        { categoriaOpcional: true }
      );
    } catch (err) {
      return res.status(err.status || 400).json({ mensagem: err.message });
    }

    const paginaId = visibilidades[0].pagina_id;
    const categoriaId = visibilidades[0].categoria_id;
    await validarPaginaAtiva(paginaId);

    let setorId = null;
    if (req.body.setor_id !== undefined && req.body.setor_id !== '') {
      try {
        setorId = await validateSetorId(req.body.setor_id, { obrigatorio: false });
      } catch (err) {
        return res.status(err.status || 400).json({ mensagem: err.message });
      }
    }

    container = await resolverContainer(req.body.container);
    await blobService.garantirContainer(container);

    const videoBlobName = blobService.novoBlobName(videoFile.originalname);
    await blobService.enviarArquivo(
      container,
      videoFile.path,
      videoBlobName,
      videoFile.mimetype
    );
    uploadedVideo = { container, blobName: videoBlobName };

    let thumbBlobName = null;
    if (thumbFile) {
      thumbBlobName = blobService.novoBlobName(thumbFile.originalname);
      await blobService.enviarArquivo(
        container,
        thumbFile.path,
        thumbBlobName,
        thumbFile.mimetype
      );
      uploadedThumb = { container, blobName: thumbBlobName };
    }

    const treinamento = await treinamentosRepo.criar({
      titulo,
      descricao: req.body.descricao?.trim() || null,
      pagina_id: paginaId,
      categoria_id: categoriaId ?? null,
      setor_id: setorId,
      area: null,
      duracao_seg: parseDuracaoSeg(req.body.duracao_seg),
      container,
      blob_name: videoBlobName,
      thumb_blob: thumbBlobName,
      destaque: req.body.destaque === 'true' || req.body.destaque === true || req.body.destaque === '1',
      ordem: req.body.ordem ? Number(req.body.ordem) : null,
      criado_por: criadoPor(req),
    });

    await treinamentoEntidadesRepo.replaceForTreinamento(treinamento.id, visibilidades);
    const full = await treinamentosRepo.findById(treinamento.id);

    await contentVersionService.bump('treinamentos');
    return res.status(201).json(full);
  } catch (err) {
    if (uploadedVideo) {
      await blobService.removerBlob(uploadedVideo.container, uploadedVideo.blobName).catch(() => {});
    }
    if (uploadedThumb) {
      await blobService.removerBlob(uploadedThumb.container, uploadedThumb.blobName).catch(() => {});
    }
    console.error('[treinamentos.criar]', err.code || err.name, err.message);
    return res.status(err.status || 500).json({
      mensagem: err.message || 'Erro ao criar treinamento.',
    });
  } finally {
    await unlinkSafe(videoFile?.path);
    await unlinkSafe(thumbFile?.path);
  }
}

async function atualizar(req, res) {
  const videoFile = req.files?.video?.[0];
  const thumbFile = req.files?.thumb?.[0];
  let uploadedVideo = null;
  let uploadedThumb = null;

  try {
    const id = Number(req.params.id);
    const existing = await treinamentosRepo.findById(id);
    if (!existing) {
      return res.status(404).json({ mensagem: 'Treinamento não encontrado.' });
    }

    const data = {};
    if (req.body.titulo !== undefined) {
      const titulo = req.body.titulo?.trim();
      if (!titulo) return res.status(400).json({ mensagem: 'titulo é obrigatório.' });
      data.titulo = titulo;
    }
    if (req.body.descricao !== undefined) {
      data.descricao = req.body.descricao?.trim() || null;
    }

    let paginaId = existing.pagina_id;
    let categoriaId = existing.categoria_id;
    let visibilidades;

    if (
      req.body.visibilidades !== undefined ||
      req.body.pagina_id !== undefined ||
      req.body.paginaId !== undefined ||
      req.body.categoria_id !== undefined ||
      req.body.categoriaId !== undefined
    ) {
      try {
        const hasLegacyPagina =
          (req.body.pagina_id != null && String(req.body.pagina_id).trim() !== '') ||
          (req.body.paginaId != null && String(req.body.paginaId).trim() !== '');
        const legacyPaginaId = hasLegacyPagina ? parsePaginaId(req.body) : existing.pagina_id;
        let legacyCategoriaId = existing.categoria_id;
        if (req.body.categoria_id !== undefined || req.body.categoriaId !== undefined) {
          legacyCategoriaId = parseCategoriaId(req.body);
        }
        visibilidades = await resolveVisibilidadesFromBody(
          req.body,
          legacyPaginaId,
          legacyCategoriaId,
          { categoriaOpcional: true }
        );
      } catch (err) {
        return res.status(err.status || 400).json({ mensagem: err.message });
      }
      paginaId = visibilidades[0].pagina_id;
      categoriaId = visibilidades[0].categoria_id;
      await validarPaginaAtiva(paginaId);
      data.pagina_id = paginaId;
      data.categoria_id = categoriaId ?? null;
    }

    if (req.body.setor_id !== undefined) {
      try {
        data.setor_id =
          req.body.setor_id === '' || req.body.setor_id == null
            ? null
            : await validateSetorId(req.body.setor_id, { obrigatorio: false });
      } catch (err) {
        return res.status(err.status || 400).json({ mensagem: err.message });
      }
    }
    if (req.body.duracao_seg !== undefined) {
      data.duracao_seg = parseDuracaoSeg(req.body.duracao_seg);
    }
    if (req.body.destaque !== undefined) {
      data.destaque =
        req.body.destaque === 'true' || req.body.destaque === true || req.body.destaque === '1';
    }
    if (req.body.ordem !== undefined) {
      data.ordem = req.body.ordem === '' || req.body.ordem == null ? null : Number(req.body.ordem);
    }
    if (req.body.ativo !== undefined) {
      data.ativo = req.body.ativo === 'true' || req.body.ativo === true || req.body.ativo === '1';
    }

    let container = existing.container;
    if (req.body.container !== undefined && req.body.container?.trim()) {
      container = await resolverContainer(req.body.container);
      data.container = container;
    }

    const oldVideo = existing.blob_name;
    const oldThumb = existing.thumb_blob;

    if (videoFile) {
      await blobService.garantirContainer(container);
      const videoBlobName = blobService.novoBlobName(videoFile.originalname);
      await blobService.enviarArquivo(
        container,
        videoFile.path,
        videoBlobName,
        videoFile.mimetype
      );
      uploadedVideo = { container, blobName: videoBlobName };
      data.blob_name = videoBlobName;
    }

    if (thumbFile) {
      await blobService.garantirContainer(container);
      const thumbBlobName = blobService.novoBlobName(thumbFile.originalname);
      await blobService.enviarArquivo(
        container,
        thumbFile.path,
        thumbBlobName,
        thumbFile.mimetype
      );
      uploadedThumb = { container, blobName: thumbBlobName };
      data.thumb_blob = thumbBlobName;
    } else if (req.body.remover_thumb === 'true' || req.body.remover_thumb === true) {
      data.thumb_blob = null;
    }

    const updated = await treinamentosRepo.atualizar(id, data);

    if (visibilidades) {
      await treinamentoEntidadesRepo.replaceForTreinamento(id, visibilidades);
    }

    if (uploadedVideo && oldVideo && oldVideo !== uploadedVideo.blobName) {
      await blobService.removerBlob(existing.container, oldVideo);
    }
    if (uploadedThumb && oldThumb && oldThumb !== uploadedThumb.blobName) {
      await blobService.removerBlob(existing.container, oldThumb);
    }
    if ((req.body.remover_thumb === 'true' || req.body.remover_thumb === true) && oldThumb && !thumbFile) {
      await blobService.removerBlob(existing.container, oldThumb);
    }

    await contentVersionService.bump('treinamentos');
    const full = await treinamentosRepo.findById(id);
    return res.json(full);
  } catch (err) {
    if (uploadedVideo) {
      await blobService.removerBlob(uploadedVideo.container, uploadedVideo.blobName);
    }
    if (uploadedThumb) {
      await blobService.removerBlob(uploadedThumb.container, uploadedThumb.blobName);
    }
    return res.status(err.status || 500).json({
      mensagem: err.message || 'Erro ao atualizar treinamento.',
    });
  } finally {
    await unlinkSafe(videoFile?.path);
    await unlinkSafe(thumbFile?.path);
  }
}

async function excluir(req, res) {
  try {
    const id = Number(req.params.id);
    const removed = await treinamentosRepo.remover(id);
    if (!removed) {
      return res.status(404).json({ mensagem: 'Treinamento não encontrado.' });
    }

    await blobService.removerBlob(removed.container, removed.blob_name);
    if (removed.thumb_blob) {
      await blobService.removerBlob(removed.container, removed.thumb_blob);
    }

    await contentVersionService.bump('treinamentos');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.status || 500).json({
      mensagem: err.message || 'Erro ao excluir treinamento.',
    });
  }
}

module.exports = {
  listar,
  listarPorPagina,
  listarAdmin,
  obter,
  playback,
  thumb,
  thumbStream,
  criar,
  atualizar,
  excluir,
};
