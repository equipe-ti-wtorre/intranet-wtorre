const FUNCTIONS = [
  `CREATE FUNCTION th_has(p_user INT, p_perm VARCHAR(80))
   RETURNS TINYINT READS SQL DATA
   BEGIN
     DECLARE ok TINYINT DEFAULT 0;
     DECLARE CONTINUE HANDLER FOR NOT FOUND SET ok = 0;
     SELECT 1 INTO ok FROM th_users u
      WHERE u.id = p_user AND IFNULL(u.active, 1) <> 0
        AND (
          JSON_CONTAINS(u.permissions, JSON_QUOTE(p_perm))
          OR (JSON_CONTAINS(u.profiles, '"admin"') AND p_perm = 'gerenciar_pessoas_todas')
          OR EXISTS (
            SELECT 1 FROM th_access_profiles ap
             WHERE JSON_CONTAINS(u.profiles, JSON_QUOTE(ap.\`key\`))
               AND ap.\`key\` <> 'admin'
               AND JSON_CONTAINS(ap.permissions, JSON_QUOTE(p_perm))
          )
        )
      LIMIT 1;
     RETURN IFNULL(ok, 0);
   END`,

  `CREATE FUNCTION th_oversees_sector(p_user INT, p_sector INT)
   RETURNS TINYINT READS SQL DATA
   BEGIN
     IF p_sector IS NULL THEN RETURN 0; END IF;
     IF EXISTS (SELECT 1 FROM th_sector_managers sm WHERE sm.sector_id = p_sector AND sm.user_id = p_user) THEN
       RETURN 1;
     END IF;
     IF EXISTS (SELECT 1 FROM th_users d WHERE d.id = p_user AND JSON_CONTAINS(d.directed_sectors, CONCAT(p_sector))) THEN
       RETURN 1;
     END IF;
     RETURN 0;
   END`,

  `CREATE FUNCTION th_oversees_team(p_user INT, p_team INT)
   RETURNS TINYINT READS SQL DATA
   BEGIN
     DECLARE v_sector INT;
     IF p_team IS NULL THEN RETURN 0; END IF;
     SELECT sector_id INTO v_sector FROM th_teams WHERE id = p_team;
     IF th_oversees_sector(p_user, v_sector) = 1 THEN RETURN 1; END IF;
     IF EXISTS (SELECT 1 FROM th_team_managers tm WHERE tm.team_id = p_team AND tm.user_id = p_user) THEN
       RETURN 1;
     END IF;
     IF th_has(p_user, 'ver_painel_equipe') = 1
        AND EXISTS (SELECT 1 FROM th_team_members m WHERE m.user_id = p_user AND m.team_id = p_team) THEN
       RETURN 1;
     END IF;
     RETURN 0;
   END`,

  `CREATE FUNCTION th_manages(p_manager INT, p_person INT)
   RETURNS TINYINT READS SQL DATA
   BEGIN
     DECLARE v_sector INT;
     IF p_person IS NULL OR p_manager = p_person THEN RETURN 0; END IF;
     SELECT sector_id INTO v_sector FROM th_users WHERE id = p_person;
     IF th_oversees_sector(p_manager, v_sector) = 1 THEN RETURN 1; END IF;
     IF EXISTS (SELECT 1 FROM th_team_members m WHERE m.user_id = p_person AND th_oversees_team(p_manager, m.team_id) = 1) THEN
       RETURN 1;
     END IF;
     RETURN 0;
   END`,

  `CREATE FUNCTION th_is_manager(p_user INT)
   RETURNS TINYINT READS SQL DATA
   BEGIN
     RETURN th_has(p_user, 'criar_corporativo');
   END`,

  `CREATE FUNCTION th_project_role(p_user INT, p_project INT)
   RETURNS VARCHAR(10) READS SQL DATA
   BEGIN
     DECLARE result VARCHAR(10) DEFAULT NULL;
     DECLARE v_team INT DEFAULT NULL;
     DECLARE v_sector INT DEFAULT NULL;
     DECLARE CONTINUE HANDLER FOR NOT FOUND SET result = NULL;
     -- Quadro de equipe: gestão da equipe/setor gerencia, membro edita (cria e exclui projetos),
     -- quem acompanha o setor só vê, convidado de um projeto vê só esse projeto.
     SELECT tb.team_id, t.sector_id INTO v_team, v_sector
       FROM th_team_boards tb JOIN th_teams t ON t.id = tb.team_id WHERE tb.project_id = p_project;
     IF v_team IS NOT NULL THEN
       IF NOT EXISTS (SELECT 1 FROM th_users u WHERE u.id = p_user AND IFNULL(u.active, 1) <> 0) THEN RETURN NULL; END IF;
       IF th_has(p_user, 'gerenciar_pessoas_todas') = 1
          OR EXISTS (SELECT 1 FROM th_team_managers tm WHERE tm.team_id = v_team AND tm.user_id = p_user)
          OR EXISTS (SELECT 1 FROM th_sector_managers sm WHERE sm.sector_id = v_sector AND sm.user_id = p_user) THEN
         RETURN 'manage';
       END IF;
       IF EXISTS (SELECT 1 FROM th_team_members m WHERE m.team_id = v_team AND m.user_id = p_user) THEN RETURN 'edit'; END IF;
       IF th_oversees_sector(p_user, v_sector) = 1 THEN RETURN 'view'; END IF;
       IF EXISTS (
         SELECT 1 FROM th_project_sections s
         LEFT JOIN th_work_members wm ON wm.work_id = s.id AND wm.user_id = p_user
         LEFT JOIN th_work_owners wo ON wo.work_id = s.id AND wo.user_id = p_user
         WHERE s.project_id = p_project AND (s.owner_id = p_user OR wm.user_id IS NOT NULL OR wo.user_id IS NOT NULL)
       ) THEN RETURN 'partial'; END IF;
       RETURN NULL;
     END IF;
     SELECT CASE
       WHEN p.space = 'pessoal' THEN CASE WHEN p.owner_id = u.id THEN 'manage' ELSE NULL END
       WHEN p.owner_id = u.id THEN 'manage'
       WHEN u.role = 'convidado' THEN CASE WHEN pm.user_id IS NOT NULL THEN 'guest' ELSE NULL END
       WHEN pm.role = 'editor' AND th_is_manager(u.id) = 1 THEN 'edit'
       WHEN pm.user_id IS NOT NULL THEN 'view'
       WHEN th_manages(u.id, p.owner_id) = 1 THEN 'view'
       WHEN EXISTS (
         SELECT 1 FROM th_project_sections s
         LEFT JOIN th_work_members wm ON wm.work_id = s.id AND wm.user_id = u.id
         LEFT JOIN th_work_owners wo ON wo.work_id = s.id AND wo.user_id = u.id
         WHERE s.project_id = p.id AND (s.owner_id = u.id OR wm.user_id IS NOT NULL OR wo.user_id IS NOT NULL)
       ) THEN 'partial'
       ELSE NULL
     END INTO result
     FROM th_users u
     JOIN th_projects p ON p.id = p_project
     LEFT JOIN th_project_members pm ON pm.project_id = p.id AND pm.user_id = u.id
     WHERE u.id = p_user AND IFNULL(u.active, 1) <> 0;
     RETURN result;
   END`,

  `CREATE FUNCTION th_work_role(p_user INT, p_work INT)
   RETURNS VARCHAR(10) READS SQL DATA
   BEGIN
     DECLARE result VARCHAR(10) DEFAULT NULL;
     DECLARE v_project INT;
     DECLARE v_owner INT;
     DECLARE v_role VARCHAR(10);
     DECLARE CONTINUE HANDLER FOR NOT FOUND SET result = NULL;
     SELECT project_id, owner_id INTO v_project, v_owner FROM th_project_sections WHERE id = p_work;
     SET v_role = th_project_role(p_user, v_project);
     IF v_role IN ('manage', 'edit') OR v_owner = p_user
        OR EXISTS (SELECT 1 FROM th_work_owners wo WHERE wo.work_id = p_work AND wo.user_id = p_user) THEN RETURN 'manage'; END IF;
     IF v_role IN ('view', 'guest') THEN RETURN 'view'; END IF;
     -- No quadro da equipe, quem está em work_members é solicitante: acompanha a fase, sem ver tarefas.
     IF EXISTS (SELECT 1 FROM th_work_members wm WHERE wm.work_id = p_work AND wm.user_id = p_user) THEN
       RETURN IF(EXISTS (SELECT 1 FROM th_team_boards tb WHERE tb.project_id = v_project), 'follow', 'view');
     END IF;
     RETURN result;
   END`,

  `CREATE FUNCTION th_task_access(p_user INT, p_task INT)
   RETURNS VARCHAR(10) READS SQL DATA
   BEGIN
     DECLARE v_space VARCHAR(12);
     DECLARE v_created INT;
     DECLARE v_private TINYINT;
     DECLARE v_assignee INT;
     DECLARE v_project INT;
     DECLARE v_section INT;
     DECLARE v_prole VARCHAR(10);
     DECLARE v_wrole VARCHAR(10);
     DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;
     SELECT COALESCE(p.space, t.space), t.created_by, t.is_private, t.assignee_id, t.project_id, t.section_id
       INTO v_space, v_created, v_private, v_assignee, v_project, v_section
       FROM th_tasks t
       LEFT JOIN th_projects p ON p.id = t.project_id
      WHERE t.id = p_task;
     IF v_created IS NULL AND v_space IS NULL THEN RETURN NULL; END IF;
     IF v_space = 'pessoal' THEN
       RETURN IF(v_created = p_user, 'edit', NULL);
     END IF;
     IF v_created = p_user THEN RETURN 'edit'; END IF;
     IF v_private = 1 AND NOT (v_assignee <=> p_user)
        AND NOT EXISTS (SELECT 1 FROM th_subtasks s WHERE s.task_id = p_task AND s.assignee_id = p_user) THEN
       RETURN NULL;
     END IF;
     IF v_project IS NOT NULL THEN
       SET v_prole = th_project_role(p_user, v_project);
       IF v_prole IN ('manage', 'edit') THEN RETURN 'edit'; END IF;
     END IF;
     IF v_section IS NOT NULL THEN
       SET v_wrole = th_work_role(p_user, v_section);
       IF v_wrole = 'manage' THEN RETURN 'edit'; END IF;
     END IF;
     IF v_assignee = p_user THEN
       RETURN IF(th_is_manager(p_user) = 1, 'edit', 'work');
     END IF;
     IF EXISTS (SELECT 1 FROM th_subtasks s WHERE s.task_id = p_task AND s.assignee_id = p_user) THEN
       RETURN 'comment';
     END IF;
     IF v_prole = 'view' THEN RETURN 'view'; END IF;
     IF v_prole = 'guest' THEN RETURN 'comment'; END IF;
     IF v_wrole = 'view' THEN RETURN 'view'; END IF;
     IF th_manages(p_user, v_assignee) = 1 OR th_manages(p_user, v_created) = 1
        OR EXISTS (SELECT 1 FROM th_subtasks s WHERE s.task_id = p_task AND th_manages(p_user, s.assignee_id) = 1) THEN
       RETURN 'view';
     END IF;
     RETURN NULL;
   END`,
];

const NAMES = [
  'th_task_access',
  'th_work_role',
  'th_project_role',
  'th_is_manager',
  'th_manages',
  'th_oversees_team',
  'th_oversees_sector',
  'th_has',
];

async function ensureFunctions(pool) {
  try {
    await pool.query('SET SESSION log_bin_trust_function_creators = 1');
  } catch {
    /* sem permissão: tenta criar mesmo assim */
  }
  for (const name of NAMES) {
    await pool.query(`DROP FUNCTION IF EXISTS ${name}`);
  }
  for (const sql of FUNCTIONS) {
    await pool.query(sql);
  }
}

module.exports = { ensureFunctions };
