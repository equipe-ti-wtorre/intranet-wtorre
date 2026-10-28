function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const { effectivePermissions } = require('./permissions');
const { avatarUrl } = require('./avatars');

function formatUser(u) {
  const perms = effectivePermissions(u);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    initials: u.initials,
    color: u.color,
    role: u.role,
    profiles: u.profiles || ['colaborador'],
    permissions: u.permissions || [],          // acessos extras marcados para a pessoa
    effective_permissions: perms,              // perfis + extras
    profile_labels: u.profile_labels || [],
    directed_sectors: u.directed_sectors || [],
    sector_id: u.sector_id ?? null,
    team_id: u.team_id ?? null,
    team_ids: Array.isArray(u.team_ids) ? u.team_ids : [],
    is_admin: (u.profiles || []).includes('admin'),
    is_director: (u.profiles || []).includes('diretoria'),
    // Pode criar no espaço Corporativo quando o perfil ou um acesso extra concede isso.
    is_manager: perms.includes('criar_corporativo'),
    can_manage_users: perms.includes('gerenciar_pessoas_todas') ? 'all' : perms.includes('gerenciar_pessoas_equipe') ? 'team' : null,
    active: u.active !== false,
    must_change_password: !!u.must_change_password,
    daily_capacity_min: u.daily_capacity_min ?? 420,
    job_title: u.job_title || '',
    department: u.department || '',
    from_directory: !!u.entra_oid,
    away_until: u.away_until || null,
    avatar_url: avatarUrl(u),
  };
}

// Senha forte: 8+ caracteres, com letra e número, e diferente do usuário.
function passwordProblem(password, username) {
  const p = String(password || '');
  if (p.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'A senha precisa ter letras e números.';
  if (username && p.toLowerCase().includes(String(username).toLowerCase())) return 'A senha não pode conter o nome de usuário.';
  if (['12345678', 'senha123', 'admin123', 'password1'].includes(p.toLowerCase())) return 'Escolha uma senha menos óbvia.';
  return null;
}

const PALETTE = ['#c9a84c', '#3b82f6', '#22c55e', '#a78bfa', '#f97316', '#14b8a6', '#ec4899', '#eab308'];
const colorFor = (seed) => PALETTE[Math.abs([...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length];

// Equipes da pessoa (pode ter várias): team_id é a primeira por id, team_ids todas, team_name os nomes juntos.
const TEAM_FIELDS = (alias) => `
  (SELECT MIN(m.team_id) FROM team_members m WHERE m.user_id = ${alias}.id) AS team_id,
  (SELECT JSON_ARRAYAGG(m.team_id) FROM team_members m WHERE m.user_id = ${alias}.id) AS team_ids,
  (SELECT GROUP_CONCAT(x.name ORDER BY x.name SEPARATOR ', ') FROM team_members m JOIN teams x ON x.id = m.team_id WHERE m.user_id = ${alias}.id) AS team_name`;

module.exports = { initialsFrom, formatUser, passwordProblem, colorFor, TEAM_FIELDS };
