const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');

const STORED_URL_PREFIX = '/api/v1/eventos/fontes/logos/';

function isStoredFonteLogoUrl(url) {
  return typeof url === 'string' && url.includes(STORED_URL_PREFIX);
}

function filenameFromFonteLogoUrl(url) {
  if (!isStoredFonteLogoUrl(url)) return null;
  return path.basename(url.split('?')[0]);
}

function deleteStoredFonteLogoFile(url) {
  const filename = filenameFromFonteLogoUrl(url);
  if (!filename) return;
  const filePath = path.join(env.eventosFontesLogosDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function cleanupOrphanFonteLogo(url, fontesRepo, excludeId = null) {
  if (!isStoredFonteLogoUrl(url)) return;

  const fontes = await fontesRepo.listarAdmin();
  const stillUsed = fontes.some(
    (f) => f.logoUrl === url && (excludeId == null || f.id !== excludeId)
  );
  if (!stillUsed) {
    deleteStoredFonteLogoFile(url);
  }
}

module.exports = {
  STORED_URL_PREFIX,
  isStoredFonteLogoUrl,
  filenameFromFonteLogoUrl,
  deleteStoredFonteLogoFile,
  cleanupOrphanFonteLogo,
};
