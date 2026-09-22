const nscService = require('./nsc.service');

function ehAdminPagina(user, modulos = []) {
  if (!user) return false;
  if (user.perfil === 'ADMIN') return true;
  return (modulos || []).includes('nao-se-cale');
}

async function usuarioPodeVisualizar(user, modulos = []) {
  if (!user) return false;
  if (ehAdminPagina(user, modulos)) return true;
  if (!user.microsoft_id) return false;
  const snap = await nscService.resolverPorAdId(user.microsoft_id);
  return !!snap?.obrigatorio_efetivo;
}

module.exports = { ehAdminPagina, usuarioPodeVisualizar };
