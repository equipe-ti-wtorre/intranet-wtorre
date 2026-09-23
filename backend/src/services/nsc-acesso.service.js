const nscPermissao = require('./nsc-permissao.service');

module.exports = {
  ehAdminPagina: nscPermissao.ehAdminPagina,
  usuarioPodeVisualizar: nscPermissao.usuarioPodeVisualizar,
  resolverAcesso: nscPermissao.resolverAcesso,
};
