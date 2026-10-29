const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { query } = require('../db');
const { HttpError } = require('./http');

const DIR = path.join(__dirname, '../../uploads/avatars');
const MAX_BYTES = 1024 * 1024;

function avatarUrl(user) {
  if (!user?.avatar_rev) return null;
  return `/api/v1/taskhub/avatars/${user.id}.jpg?v=${user.avatar_rev}`;
}

function fileFor(id) {
  return path.join(DIR, `${id}.jpg`);
}

function decodeImage(dataUrl) {
  const match = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) throw new HttpError(422, 'Envie uma foto JPEG ou PNG.');
  const buf = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw new HttpError(422, 'A foto precisa ter até 1 MB.');
  const kind = match[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
  const png = buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (kind === 'png' ? !png : !jpeg) throw new HttpError(422, 'Envie uma foto JPEG ou PNG.');
  return buf;
}

async function toJpeg(buf) {
  try {
    return await sharp(buf, { failOn: 'error', limitInputPixels: 8_000_000 })
      .rotate()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new HttpError(422, 'Não foi possível ler a foto.');
  }
}

async function saveAvatar(userId, dataUrl) {
  const jpeg = await toJpeg(decodeImage(dataUrl));
  await fs.promises.mkdir(DIR, { recursive: true });
  const tmp = `${fileFor(userId)}.tmp`;
  await fs.promises.writeFile(tmp, jpeg);
  await fs.promises.rename(tmp, fileFor(userId));
  const { rows } = await query(
    `UPDATE users SET avatar_rev = COALESCE(avatar_rev, 0) + 1 WHERE id = $1 RETURNING avatar_rev`,
    [userId]
  );
  if (!rows.length) throw new HttpError(404, 'Pessoa não encontrada');
  return rows[0].avatar_rev;
}

async function removeAvatar(userId) {
  await fs.promises.rm(fileFor(userId), { force: true });
  const { rows } = await query(
    `UPDATE users SET avatar_rev = NULL WHERE id = $1 RETURNING id`,
    [userId]
  );
  if (!rows.length) throw new HttpError(404, 'Pessoa não encontrada');
}

function sendAvatar(id, res) {
  const file = fileFor(id);
  if (!fs.existsSync(file)) {
    res.status(404).json({ message: 'Foto não encontrada' });
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type('jpeg');
  res.sendFile(path.resolve(file));
}

module.exports = { avatarUrl, saveAvatar, removeAvatar, sendAvatar };
