const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');
const { LOCAL_BLOB_NAME_RE } = require('./pesquisas-blob-local');

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

function ativo() {
  return !!env.solicitacaoBlobLocal;
}

function isLocalContainer(container) {
  return ativo() && container === env.solicitacaoColaboradorContainer;
}

function dir() {
  return path.join(__dirname, '..', '..', 'storage', 'solicitacao-colaborador');
}

function safeName(blobName) {
  const name = path.basename(String(blobName || ''));
  if (!LOCAL_BLOB_NAME_RE.test(name)) return null;
  return name;
}

function filePath(blobName) {
  const name = safeName(blobName);
  if (!name) return null;
  const root = path.resolve(dir());
  const dest = path.resolve(root, name);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (dest !== root && !dest.startsWith(prefix)) return null;
  return dest;
}

function contentTypeOf(blobName, fallback) {
  const ext = path.extname(blobName || '').toLowerCase();
  return MIME[ext] || fallback || 'application/octet-stream';
}

async function garantirDir() {
  await fs.promises.mkdir(dir(), { recursive: true });
}

async function writeType(dest, contentType) {
  if (!contentType) return;
  await fs.promises.writeFile(`${dest}.type`, String(contentType).slice(0, 120), 'utf8');
}

async function readType(dest) {
  try {
    const raw = await fs.promises.readFile(`${dest}.type`, 'utf8');
    return raw.trim() || null;
  } catch {
    return null;
  }
}

function invalidNameError() {
  const err = new Error('Nome de arquivo inválido.');
  err.status = 400;
  return err;
}

function notFoundError() {
  const err = new Error('Arquivo não encontrado.');
  err.status = 404;
  return err;
}

async function salvarArquivo(blobName, fromPath, contentType) {
  const dest = filePath(blobName);
  if (!dest) throw invalidNameError();
  await garantirDir();
  await fs.promises.copyFile(fromPath, dest);
  await writeType(dest, contentType);
  return path.basename(dest);
}

async function salvarBuffer(blobName, buffer, contentType) {
  const dest = filePath(blobName);
  if (!dest) throw invalidNameError();
  await garantirDir();
  await fs.promises.writeFile(dest, buffer);
  await writeType(dest, contentType);
  return path.basename(dest);
}

async function ler(blobName) {
  const dest = filePath(blobName);
  if (!dest) throw notFoundError();
  try {
    await fs.promises.access(dest, fs.constants.R_OK);
  } catch {
    throw notFoundError();
  }
  const buffer = await fs.promises.readFile(dest);
  const contentType = (await readType(dest)) || contentTypeOf(blobName);
  return { buffer, contentType, filename: path.basename(dest), path: dest };
}

async function remover(blobName) {
  const dest = filePath(blobName);
  if (!dest) return;
  try {
    await fs.promises.unlink(dest);
  } catch {
    /* ignore */
  }
  try {
    await fs.promises.unlink(`${dest}.type`);
  } catch {
    /* ignore */
  }
}

module.exports = {
  ativo,
  isLocalContainer,
  dir,
  safeName,
  filePath,
  contentTypeOf,
  garantirDir,
  salvarArquivo,
  salvarBuffer,
  ler,
  remover,
};
