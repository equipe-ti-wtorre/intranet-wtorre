const { DefaultAzureCredential } = require('@azure/identity');
const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} = require('@azure/storage-blob');
const crypto = require('crypto');
const path = require('path');
const { env } = require('../config/env');
const { validarNomeContainer } = require('../utils/container-nome.validation');
const { mapAzureBlobError } = require('../utils/azure-blob.errors');

const account = env.azureStorageAccount;
const credential = new DefaultAzureCredential();
const svc = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);

function getExtension(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ext || '';
}

function novoBlobName(originalName) {
  return `${crypto.randomUUID()}${getExtension(originalName)}`;
}

async function withBlobError(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err?.status) throw err;
    throw mapAzureBlobError(err);
  }
}

async function garantirContainer(nome) {
  const v = validarNomeContainer(nome);
  if (!v.ok) {
    const err = new Error(v.mensagem);
    err.status = 400;
    throw err;
  }
  return withBlobError(async () => {
    await svc.getContainerClient(v.nome).createIfNotExists();
    return v.nome;
  });
}

/** Container com leitura pública anônima nos blobs (URLs diretas, sem SAS). */
async function garantirContainerLeituraPublica(nome) {
  const v = validarNomeContainer(nome);
  if (!v.ok) {
    const err = new Error(v.mensagem);
    err.status = 400;
    throw err;
  }
  return withBlobError(async () => {
    const client = svc.getContainerClient(v.nome);
    const created = await client.createIfNotExists({ access: 'blob' });
    if (!created.succeeded) {
      // Já existia — garante leitura pública nos blobs (idempotente se já estiver ok).
      try {
        await client.setAccessPolicy('blob');
      } catch {
        /* conta pode já estar correta ou política imutável */
      }
    }
    return v.nome;
  });
}

async function containerExiste(nome) {
  const v = validarNomeContainer(nome);
  if (!v.ok) return false;
  return withBlobError(() => svc.getContainerClient(v.nome).exists());
}

async function listarContainersDaConta() {
  return withBlobError(async () => {
    const names = [];
    for await (const item of svc.listContainers()) {
      names.push(item.name);
    }
    return names;
  });
}

async function enviarArquivo(container, caminhoTmp, blobName, contentType) {
  return withBlobError(async () => {
    const client = svc.getContainerClient(container).getBlockBlobClient(blobName);
    await client.uploadFile(caminhoTmp, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return blobName;
  });
}

async function enviarBuffer(container, buffer, blobName, contentType) {
  return withBlobError(async () => {
    const client = svc.getContainerClient(container).getBlockBlobClient(blobName);
    await client.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType || 'application/octet-stream' },
    });
    return blobName;
  });
}

async function removerBlob(container, blobName) {
  if (!blobName) return;
  return withBlobError(() =>
    svc.getContainerClient(container).getBlockBlobClient(blobName).deleteIfExists()
  );
}

// Cache da user delegation key: vale por horas e assina várias SAS.
// Evita uma ida ao Entra a cada playback/thumbnail.
let _udkCache = null; // { udk, expiraEmMs }

async function getDelegationKey() {
  const agora = Date.now();
  // A chave precisa cobrir QUALQUER SAS que ainda será assinada:
  // renovar enquanto o tempo restante for menor que o TTL da SAS + folga.
  const margemMs = env.treinamentosSasTtlMin * 60 * 1000 + 10 * 60 * 1000;
  if (!_udkCache || _udkCache.expiraEmMs - agora < margemMs) {
    // Janela da chave bem maior que a margem, para não renovar a toda hora.
    const vidaMs = Math.max(8 * 60 * 60 * 1000, margemMs + 60 * 60 * 1000);
    const startsOn = new Date(agora - 5 * 60 * 1000);
    const expiresOn = new Date(agora + vidaMs);
    _udkCache = {
      udk: await svc.getUserDelegationKey(startsOn, expiresOn),
      expiraEmMs: expiresOn.getTime(),
    };
  }
  return _udkCache.udk;
}

function contentDispositionAttachment(originalName) {
  const raw = path.basename(String(originalName || 'arquivo')).replace(/[\r\n]/g, '').trim();
  const nome = raw.slice(0, 180) || 'arquivo';
  const ascii = nome.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'arquivo';
  const encoded = encodeURIComponent(nome).replace(/['()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function gerarSasLeitura(container, blobName, opts = {}) {
  return withBlobError(async () => {
    const now = new Date();
    const startsOn = new Date(now.getTime() - 5 * 60 * 1000);
    const expiresOn = new Date(now.getTime() + env.treinamentosSasTtlMin * 60 * 1000);
    const udk = await getDelegationKey();
    const downloadNome = opts?.downloadNome ? String(opts.downloadNome).trim() : '';
    const sas = generateBlobSASQueryParameters(
      {
        containerName: container,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
        protocol: SASProtocol.Https,
        ...(downloadNome ? { contentDisposition: contentDispositionAttachment(downloadNome) } : {}),
      },
      udk,
      account
    ).toString();
    const baseUrl = svc.getContainerClient(container).getBlockBlobClient(blobName).url;
    return { url: `${baseUrl}?${sas}`, expiraEm: expiresOn.toISOString() };
  });
}

async function baixarBuffer(container, blobName) {
  return withBlobError(async () => {
    const client = svc.getContainerClient(container).getBlockBlobClient(blobName);
    const exists = await client.exists();
    if (!exists) {
      const err = new Error('Arquivo não encontrado no storage.');
      err.status = 404;
      throw err;
    }
    const props = await client.getProperties();
    const buffer = await client.downloadToBuffer();
    const contentType = props.contentType || 'application/octet-stream';
    const filename = blobName.includes('/') ? blobName.split('/').pop() : blobName;
    return { buffer, contentType, filename };
  });
}

function urlBlobPublico(container, blobName) {
  const baseUrl = svc.getContainerClient(container).getBlockBlobClient(blobName).url;
  return baseUrl;
}

module.exports = {
  garantirContainer,
  garantirContainerLeituraPublica,
  containerExiste,
  listarContainersDaConta,
  enviarArquivo,
  enviarBuffer,
  removerBlob,
  gerarSasLeitura,
  baixarBuffer,
  urlBlobPublico,
  novoBlobName,
};
