const fs = require('fs');
const cipaService = require('../services/cipa.service');
const colaboradoresRepo = require('../repositories/colaboradores.repository');
const {
  resolveCipaImagemPath,
  mimeFromFilename,
  removeCipaImagem,
} = require('../config/cipa-upload');

function handleError(res, err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ mensagem: 'Registro já existente.' });
  }
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[cipa]', err);
  }
  return res.status(status).json({
    mensagem: err.message || 'Erro ao processar o evento da Agenda RH.',
  });
}

async function listarPublicos(req, res) {
  try {
    const lista = await cipaService.listarPublicos(req.user, req.userModulos || []);
    return res.json(lista);
  } catch (err) {
    return handleError(res, err);
  }
}

async function obterPublico(req, res) {
  try {
    const evento = await cipaService.obterPublico(
      req.params.codigo,
      req.user,
      req.userModulos || []
    );
    return res.json(evento);
  } catch (err) {
    return handleError(res, err);
  }
}

async function servirImagem(req, res) {
  try {
    const filename = await cipaService.obterImagemMeta(
      req.params.codigo,
      req.user,
      req.userModulos || []
    );
    const filePath = resolveCipaImagemPath(filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ mensagem: 'Imagem não encontrada.' });
    }
    res.setHeader('Content-Type', mimeFromFilename(filename));
    res.setHeader('ETag', `"${filename}"`);
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.sendFile(filePath);
  } catch (err) {
    return handleError(res, err);
  }
}

async function inscrever(req, res) {
  try {
    const result = await cipaService.inscrever(
      req.params.codigo,
      req.user,
      req.userModulos || [],
      req.body || {}
    );
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarAdmin(req, res) {
  try {
    return res.json(await cipaService.listarAdmin());
  } catch (err) {
    return handleError(res, err);
  }
}

async function obterAdmin(req, res) {
  try {
    return res.json(await cipaService.obterAdmin(req.params.codigo));
  } catch (err) {
    return handleError(res, err);
  }
}

async function criar(req, res) {
  try {
    const criado = await cipaService.criar(req.body || {}, req.file);
    return res.status(201).json(criado);
  } catch (err) {
    if (req.file?.filename) removeCipaImagem(req.file.filename);
    return handleError(res, err);
  }
}

async function atualizar(req, res) {
  try {
    const atualizado = await cipaService.atualizar(
      req.params.codigo,
      req.body || {},
      req.file
    );
    return res.json(atualizado);
  } catch (err) {
    if (req.file?.filename) removeCipaImagem(req.file.filename);
    return handleError(res, err);
  }
}

async function excluir(req, res) {
  try {
    return res.json(await cipaService.excluir(req.params.codigo));
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarInscritos(req, res) {
  try {
    return res.json(await cipaService.listarInscritos(req.params.codigo));
  } catch (err) {
    return handleError(res, err);
  }
}

async function excluirInscricao(req, res) {
  try {
    return res.json(
      await cipaService.excluirInscricao(
        req.params.codigo,
        Number(req.params.inscricaoId)
      )
    );
  } catch (err) {
    return handleError(res, err);
  }
}

async function exportarXlsx(req, res) {
  try {
    const { buffer, filename } = await cipaService.exportarXlsx(req.params.codigo);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    return handleError(res, err);
  }
}

async function buscarColaboradores(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const lista = await colaboradoresRepo.findAll({ busca: q, ativoOnly: true });
    return res.json(
      lista.slice(0, 20).map((c) => ({
        id: c.id,
        nome: c.nome,
        email: c.email,
        departamento: c.departamento,
        empresa: c.empresa,
        ja_cadastrado: false,
        usuario_id: null,
      }))
    );
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  listarPublicos,
  obterPublico,
  servirImagem,
  inscrever,
  listarAdmin,
  obterAdmin,
  criar,
  atualizar,
  excluir,
  listarInscritos,
  excluirInscricao,
  exportarXlsx,
  buscarColaboradores,
};
