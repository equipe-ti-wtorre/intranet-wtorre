const nscRepo = require('../repositories/nsc.repository');
const nscService = require('./nsc.service');

function ehAdminPagina(user, modulos = []) {
  if (!user) return false;
  if (user.perfil === 'ADMIN') return true;
  return (modulos || []).includes('nao-se-cale');
}

function acessoVazio() {
  return {
    pode_visualizar: false,
    pode_ver_equipe: false,
    escopo: null,
    departamentos: [],
    empresas: [],
    permissoes: {
      baixar: false,
      exportar: false,
      lembrar: false,
      aprovar: false,
    },
    grupo_nome: null,
    label_escopo: null,
  };
}

function acessoAdmin() {
  return {
    pode_visualizar: true,
    pode_ver_equipe: true,
    escopo: 'global',
    departamentos: [],
    empresas: [],
    permissoes: {
      baixar: true,
      exportar: true,
      lembrar: true,
      aprovar: true,
    },
    grupo_nome: 'Administrador',
    label_escopo: 'todos os departamentos',
  };
}

function labelEscopo(escopo, departamentos = [], empresas = []) {
  if (escopo === 'global') return 'todos os departamentos';
  const partes = [...(departamentos || []), ...(empresas || [])].filter(Boolean);
  if (!partes.length) return 'recorte definido no admin';
  return partes.join(', ');
}

function normalizeValor(value) {
  return String(value || '').trim().toLowerCase();
}

function acessoDoPerfil(row) {
  if (row.perfil === 'total') {
    return {
      pode_visualizar: true,
      pode_ver_equipe: true,
      escopo: 'global',
      departamentos: [],
      empresas: [],
      permissoes: {
        baixar: true,
        exportar: true,
        lembrar: true,
        aprovar: true,
      },
      grupo_nome: 'Total',
      label_escopo: labelEscopo('global'),
    };
  }
  const departamentos = row.departamentos || [];
  const empresas = row.empresas || [];
  return {
    pode_visualizar: true,
    pode_ver_equipe: true,
    escopo: 'recorte',
    departamentos,
    empresas,
    permissoes: {
      baixar: true,
      exportar: false,
      lembrar: true,
      aprovar: false,
    },
    grupo_nome: 'Gestor',
    label_escopo: labelEscopo('recorte', departamentos, empresas),
  };
}

async function departamentosVinculados(adObjectId) {
  if (!adObjectId) return [];
  try {
    return await nscRepo.listDepartamentosDoGestor(adObjectId);
  } catch {
    return [];
  }
}

function unicos(values) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

async function resolverAcesso(user, modulos = []) {
  if (!user) return acessoVazio();
  if (ehAdminPagina(user, modulos)) return acessoAdmin();

  let row = null;
  const deptosGestor = await departamentosVinculados(user.microsoft_id);
  if (user.microsoft_id) {
    try {
      row = await nscRepo.findAcessoUsuarioByAdId(user.microsoft_id);
    } catch {
      row = null;
    }
  }

  let obrigatorio = false;
  if (user.microsoft_id) {
    try {
      const snap = await nscService.resolverPorAdId(user.microsoft_id);
      obrigatorio = !!snap?.obrigatorio_efetivo;
    } catch {
      obrigatorio = false;
    }
  }

  if (row?.perfil === 'total') {
    return { ...acessoDoPerfil(row), pode_visualizar: true };
  }
  if (row?.perfil === 'gestor' || deptosGestor.length) {
    return {
      ...acessoDoPerfil({
        perfil: 'gestor',
        departamentos: unicos([...(row?.departamentos || []), ...deptosGestor]),
        empresas: row?.empresas || [],
      }),
      pode_visualizar: true,
    };
  }
  if (obrigatorio) {
    return {
      ...acessoVazio(),
      pode_visualizar: true,
    };
  }
  return acessoVazio();
}

async function usuarioPodeVisualizar(user, modulos = []) {
  const acesso = await resolverAcesso(user, modulos);
  return !!acesso.pode_visualizar;
}

function colaboradorNoEscopo(colab, acesso) {
  if (!acesso?.pode_ver_equipe) return false;
  if (acesso.escopo === 'global') return true;
  const depto = normalizeValor(colab?.departamento);
  const empresa = normalizeValor(colab?.empresa);
  const deptos = (acesso.departamentos || []).map(normalizeValor).filter(Boolean);
  const empresas = (acesso.empresas || []).map(normalizeValor).filter(Boolean);
  if (depto && deptos.includes(depto)) return true;
  if (empresa && empresas.includes(empresa)) return true;
  return false;
}

function exigirPermissao(acesso, flag) {
  if (!acesso?.pode_ver_equipe) {
    const err = new Error('Acesso restrito aos certificados da equipe.');
    err.status = 403;
    throw err;
  }
  if (flag && !acesso.permissoes?.[flag]) {
    const err = new Error('Você não tem permissão para esta ação.');
    err.status = 403;
    throw err;
  }
}

async function registrarLog(user, acao, extra = {}) {
  try {
    await nscRepo.registrarAcessoLog({
      usuarioId: user?.id || null,
      usuarioEmail: user?.email || null,
      usuarioNome: user?.nome_completo || user?.username || extra.usuarioNome || null,
      acao,
      alvoAdObjectId: extra.alvoAdObjectId || null,
      alvoNome: extra.alvoNome || null,
      detalhe: extra.detalhe || null,
    });
  } catch (err) {
    console.warn('[nsc] falha ao registrar log de acesso:', err.message);
  }
}

module.exports = {
  ehAdminPagina,
  resolverAcesso,
  usuarioPodeVisualizar,
  colaboradorNoEscopo,
  exigirPermissao,
  registrarLog,
  labelEscopo,
};
