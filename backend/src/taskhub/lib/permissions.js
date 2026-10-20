// Acessos (fixos, porque cada um é uma regra do sistema) e perfis (editáveis, na tabela
// access_profiles). Uma pessoa pode ter vários perfis; os acessos se somam aos extras marcados.
// A mesma regra existe no banco (função th_has, em db/migrate.js).

const PERMISSIONS = [
  { key: 'criar_corporativo', label: 'Criar projetos e tarefas no Corporativo', hint: 'Montar projetos, distribuir tarefas e incluir colaboradores.' },
  { key: 'criar_equipes', label: 'Criar equipes', hint: 'Cria equipes no próprio setor (ou nos setores que gerencia) e vira gestor delas.' },
  { key: 'ver_painel_equipe', label: 'Ver o painel e o trabalho da própria equipe', hint: 'Acompanha as tarefas corporativas das pessoas da própria equipe.' },
  { key: 'ver_todas_equipes', label: 'Ver todos os setores e equipes', hint: 'Visão da empresa inteira (somente leitura).' },
  { key: 'gerenciar_pessoas_equipe', label: 'Cadastrar e editar pessoas dos setores e equipes que gerencia', hint: 'Cria contas de colaborador, edita dados, desativa e gera senha temporária.' },
  { key: 'gerenciar_pessoas_todas', label: 'Administrar pessoas, setores e perfis', hint: 'Define perfis e acessos, cria setores e escolhe os gestores de cada um.' },
];
const PERMISSION_KEYS = PERMISSIONS.map(p => p.key);

// Trechos SQL para carregar, junto com a pessoa, os acessos e nomes dos perfis dela.
const PROFILE_SQL = (alias) => `
  (SELECT JSON_ARRAYAGG(jt.perm)
     FROM access_profiles ap
     JOIN JSON_TABLE(ap.permissions, '$[*]' COLUMNS (perm VARCHAR(80) PATH '$')) jt
    WHERE JSON_CONTAINS(${alias}.profiles, JSON_QUOTE(ap.key)) AND ap.key <> 'admin') AS profile_perms,
  (SELECT JSON_ARRAYAGG(ap.label)
     FROM access_profiles ap
    WHERE JSON_CONTAINS(${alias}.profiles, JSON_QUOTE(ap.key))) AS profile_labels`;

function effectivePermissions(u) {
  const set = new Set([...(u.permissions || []), ...(u.profile_perms || [])]);
  // O perfil admin só administra. Os outros acessos vêm de outro perfil ou de extras da pessoa.
  if ((u.profiles || []).includes('admin')) set.add('gerenciar_pessoas_todas');
  return PERMISSION_KEYS.filter(k => set.has(k));
}

const has = (u, perm) => effectivePermissions(u).includes(perm);

// Campos legados mantidos em sincronia (role e is_director).
async function syncLegacy(run, userId) {
  await run.query(
    `UPDATE users SET
       role = CASE WHEN 'admin' = ANY(profiles) THEN 'admin'
                   WHEN 'gestor' = ANY(profiles) THEN 'gestor'
                   WHEN role = 'convidado' THEN 'convidado' ELSE 'membro' END,
       is_director = 'diretoria' = ANY(profiles)
     WHERE id = $1`, [userId]
  );
}

module.exports = { PERMISSIONS, PERMISSION_KEYS, PROFILE_SQL, effectivePermissions, has, syncLegacy };
