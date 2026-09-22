const { decrypt } = require('./crypto.service');
const { fetchUserPhotoBufferFromTenant } = require('./microsoftGraph');

async function getAppToken(tenant) {
  const clientSecret = decrypt(tenant.client_secret_ciphertext);
  if (!clientSecret) {
    throw new Error('Client secret não configurado para este tenant.');
  }

  const url = `https://login.microsoftonline.com/${tenant.azure_tenant_id}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: tenant.client_id,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Falha ao obter token Graph');
  }
  return data.access_token;
}

async function getUserProfile(tenant, oid) {
  const token = await getAppToken(tenant);
  const select =
    'displayName,department,companyName,officeLocation,jobTitle,onPremisesDepartment,onPremisesExtensionAttributes';
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${oid}?$select=${select}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Falha ao consultar perfil no Graph');
  }
  return res.json();
}

function extractDepartment(profile) {
  const oea = profile.onPremisesExtensionAttributes || {};
  const candidates = [
    profile.department,
    profile.onPremisesDepartment,
    oea.extensionAttribute1,
    oea.extensionAttribute2,
    oea.extensionAttribute3,
    profile.companyName,
    profile.officeLocation,
    profile.jobTitle,
  ];
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c).trim();
  }
  return null;
}

async function getUserPhoto(tenant, oid) {
  return fetchUserPhotoBufferFromTenant(tenant, oid);
}

async function testConnection(tenant) {
  const token = await getAppToken(tenant);
  const res = await fetch('https://graph.microsoft.com/v1.0/users?$top=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Falha na conexão com Microsoft Graph');
  }
  return true;
}

const { buildUserSelect } = require('../utils/colaboradores.directory-extension');

async function listAllUsers(tenant) {
  const token = await getAppToken(tenant);
  const select = buildUserSelect(tenant.client_id);
  const users = [];
  let url = `https://graph.microsoft.com/v1.0/users?$select=${encodeURIComponent(select)}&$top=999`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Falha ao listar usuários no Graph');
    }
    const data = await res.json();
    if (Array.isArray(data.value)) {
      users.push(...data.value);
    }
    url = data['@odata.nextLink'] || null;
  }

  return users;
}

const { normalizeMailboxUserPurpose } = require('../utils/colaboradores.mailbox-purpose');

const BATCH_CHUNK_SIZE = 20;

function parseMailboxPurposeResponse(body, status) {
  if (status === 200) {
    return normalizeMailboxUserPurpose(body);
  }
  if (status === 404) {
    return null;
  }
  return undefined;
}

async function fetchMailboxUserPurposes(token, userIds) {
  const purposes = new Map();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) {
    return { purposes, disponivel: true };
  }

  const probeRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ids[0])}/mailboxSettings/userPurpose`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (probeRes.status === 403) {
    return { purposes, disponivel: false };
  }

  const probeBody = await probeRes.json().catch(() => ({}));
  const probePurpose = parseMailboxPurposeResponse(probeBody, probeRes.status);
  if (probePurpose !== undefined) {
    purposes.set(ids[0], probePurpose);
  } else if (probeRes.status !== 404) {
    const msg = probeBody.error?.message || 'Falha ao consultar tipo de caixa no Graph.';
    throw new Error(msg);
  }

  for (let offset = 1; offset < ids.length; offset += BATCH_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + BATCH_CHUNK_SIZE);
    const batchBody = {
      requests: chunk.map((id, index) => ({
        id: String(index + 1),
        method: 'GET',
        url: `/users/${id}/mailboxSettings/userPurpose`,
      })),
    };

    const batchRes = await fetch('https://graph.microsoft.com/v1.0/$batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batchBody),
    });

    if (!batchRes.ok) {
      const err = await batchRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Falha no batch de mailboxSettings no Graph.');
    }

    const batchData = await batchRes.json();
    for (const item of batchData.responses || []) {
      const idx = Number(item.id) - 1;
      const userId = chunk[idx];
      if (!userId) continue;

      let body = item.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }

      const purpose = parseMailboxPurposeResponse(body, item.status);
      if (purpose !== undefined) {
        purposes.set(userId, purpose);
      }
    }
  }

  return { purposes, disponivel: true };
}

function encodeDrivePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeShareUrl(shareUrl) {
  const trimmed = String(shareUrl || '').trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.searchParams.delete('rtime');
    return url.toString();
  } catch {
    return trimmed.replace(/([?&])rtime=[^&]*&?/g, '$1').replace(/[?&]$/, '');
  }
}

function encodeShareUrl(shareUrl) {
  const normalized = normalizeShareUrl(shareUrl);
  if (!normalized) {
    throw new Error('URL de compartilhamento vazia.');
  }
  return `u!${Buffer.from(normalized, 'utf8').toString('base64url')}`;
}

async function downloadSharedDriveItemContent(token, shareUrl) {
  const shareId = encodeShareUrl(shareUrl);
  const metaUrl = `https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareId)}/driveItem`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Falha ao resolver URL de compartilhamento via Graph.');
  }

  const meta = await metaRes.json();
  const driveId = meta.parentReference?.driveId || meta.driveId;
  const itemId = meta.id;
  if (!driveId || !itemId) {
    const err = new Error('Metadados do arquivo incompletos na resposta Graph (/shares).');
    err.status = 502;
    throw err;
  }
  return downloadDriveItemContent(token, driveId, itemId);
}

async function downloadDriveItemContent(token, driveId, fileRef) {
  const ref = String(fileRef || '').trim();
  if (!ref) {
    throw new Error('Referência do arquivo SharePoint não configurada.');
  }

  const isPath = ref.includes('/') || ref.includes('\\');
  const url = isPath
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeDrivePath(ref.replace(/\\/g, '/'))}:/content`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(ref)}/content`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Falha ao baixar arquivo do SharePoint via Graph.');
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getUserManager(tenant, oid) {
  if (!tenant || !oid) return null;
  const token = await getAppToken(tenant);
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oid)}` +
    `?$select=id&$expand=manager($select=id,mail,displayName,userPrincipalName)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.error?.message || 'Falha ao consultar gestor no Graph');
    error.status = res.status;
    throw error;
  }
  const data = await res.json();
  const manager = data.manager;
  if (!manager?.id) return null;
  const email = (manager.mail || manager.userPrincipalName || '').trim() || null;
  return {
    ad_id: manager.id,
    email,
    nome: manager.displayName ? String(manager.displayName).trim() : null,
  };
}

async function updateUser(tenant, adId, patch) {
  if (!adId || !patch || !Object.keys(patch).length) {
    throw new Error('Nada para atualizar no Graph.');
  }

  const token = await getAppToken(tenant);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(adId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err.error?.message || 'Falha ao atualizar usuário no Graph';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return true;
}

module.exports = {
  getAppToken,
  getUserProfile,
  extractDepartment,
  getUserPhoto,
  testConnection,
  listAllUsers,
  fetchMailboxUserPurposes,
  getUserManager,
  updateUser,
  normalizeShareUrl,
  encodeShareUrl,
  downloadSharedDriveItemContent,
  downloadDriveItemContent,
};
