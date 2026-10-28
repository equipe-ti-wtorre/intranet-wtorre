-- TaskHub dentro da intranet. Tabelas com prefixo th_ para não misturar com o restante.
-- O usuário administrador nasce no bootstrap do processo, não aqui.
--
-- ALTER manual (bancos criados antes de a pessoa poder estar em várias equipes), uma vez:
--   ALTER TABLE th_team_members ADD KEY idx_th_team_members_user (user_id), DROP INDEX uk_th_team_members_user;

CREATE TABLE IF NOT EXISTS th_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password VARCHAR(255) NULL,
  initials VARCHAR(4) NOT NULL,
  color VARCHAR(20) DEFAULT '#c9a84c',
  role VARCHAR(20) DEFAULT 'membro',
  username VARCHAR(80) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  is_director TINYINT(1) NOT NULL DEFAULT 0,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  daily_capacity_min INT NOT NULL DEFAULT 420,
  job_title VARCHAR(100) NULL,
  token_version INT NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  away_until DATE NULL,
  entra_oid VARCHAR(64) NULL,
  department VARCHAR(200) NULL,
  avatar_rev INT NULL,
  sector_id INT NULL,
  profiles JSON NOT NULL,
  permissions JSON NOT NULL,
  directed_teams JSON NOT NULL,
  directed_sectors JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_th_users_email (email),
  UNIQUE KEY uk_th_users_username (username),
  UNIQUE KEY uk_th_users_entra (entra_oid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  user_agent VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_th_refresh_hash (token_hash),
  KEY idx_th_refresh_user (user_id),
  CONSTRAINT fk_th_refresh_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(60) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#6b7280',
  icon VARCHAR(10) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_th_categories (user_id, name),
  CONSTRAINT fk_th_categories_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_sectors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  archived TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_sector_managers (
  sector_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (sector_id, user_id),
  CONSTRAINT fk_th_sm_sector FOREIGN KEY (sector_id) REFERENCES th_sectors(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_sm_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  members_can_create TINYINT(1) NOT NULL DEFAULT 0,
  archived TINYINT(1) NOT NULL DEFAULT 0,
  sector_id INT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_teams_sector (sector_id),
  CONSTRAINT fk_th_teams_sector FOREIGN KEY (sector_id) REFERENCES th_sectors(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_teams_creator FOREIGN KEY (created_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_team_members (
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'membro',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  KEY idx_th_team_members_user (user_id),
  CONSTRAINT fk_th_tm_team FOREIGN KEY (team_id) REFERENCES th_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_tm_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_team_managers (
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT fk_th_tmg_team FOREIGN KEY (team_id) REFERENCES th_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_tmg_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#c9a84c',
  owner_id INT NULL,
  created_by INT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  health VARCHAR(12) NOT NULL DEFAULT 'no_prazo',
  visibility VARCHAR(10) NOT NULL DEFAULT 'equipe',
  archived TINYINT(1) NOT NULL DEFAULT 0,
  show_to_manager TINYINT(1) NOT NULL DEFAULT 0,
  space VARCHAR(12) NOT NULL DEFAULT 'profissional',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_th_projects_team (team_id),
  CONSTRAINT fk_th_projects_team FOREIGN KEY (team_id) REFERENCES th_teams(id) ON DELETE RESTRICT,
  CONSTRAINT fk_th_projects_owner FOREIGN KEY (owner_id) REFERENCES th_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_th_projects_creator FOREIGN KEY (created_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_project_members (
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'editor',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  KEY idx_th_pm_user (user_id),
  CONSTRAINT fk_th_pm_project FOREIGN KEY (project_id) REFERENCES th_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_pm_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_workflow_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  name VARCHAR(60) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#8b93a1',
  category VARCHAR(10) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  wip_limit INT NULL,
  KEY idx_th_ws_project (project_id),
  CONSTRAINT fk_th_ws_project FOREIGN KEY (project_id) REFERENCES th_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_project_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  owner_id INT NULL,
  due_date DATE NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#4c8dff',
  completed_at DATETIME NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_ps_project (project_id),
  CONSTRAINT fk_th_ps_project FOREIGN KEY (project_id) REFERENCES th_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_ps_owner FOREIGN KEY (owner_id) REFERENCES th_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_th_ps_creator FOREIGN KEY (created_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_work_members (
  work_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (work_id, user_id),
  CONSTRAINT fk_th_wm_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wm_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_work_visits (
  user_id INT NOT NULL,
  work_id INT NOT NULL,
  visited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, work_id),
  CONSTRAINT fk_th_wv_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_wv_work FOREIGN KEY (work_id) REFERENCES th_project_sections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  title VARCHAR(300) NOT NULL,
  status VARCHAR(20) NULL,
  priority VARCHAR(20) DEFAULT 'media',
  notes TEXT NULL,
  deadline DATE NULL,
  tags JSON NOT NULL,
  project_id INT NULL,
  section_id INT NULL,
  status_id INT NULL,
  assignee_id INT NULL,
  created_by INT NULL,
  start_date DATE NULL,
  estimate_min INT NULL,
  completed_at DATETIME NULL,
  position DOUBLE NOT NULL DEFAULT 0,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  blocked_reason TEXT NULL,
  migrated_v2 TINYINT(1) NOT NULL DEFAULT 0,
  show_to_manager TINYINT(1) NOT NULL DEFAULT 0,
  space VARCHAR(12) NOT NULL DEFAULT 'profissional',
  size CHAR(1) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_th_tasks_project (project_id),
  KEY idx_th_tasks_assignee (assignee_id),
  KEY idx_th_tasks_created_by (created_by),
  KEY idx_th_tasks_deadline (deadline),
  CONSTRAINT fk_th_tasks_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_tasks_project FOREIGN KEY (project_id) REFERENCES th_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_tasks_section FOREIGN KEY (section_id) REFERENCES th_project_sections(id) ON DELETE SET NULL,
  CONSTRAINT fk_th_tasks_status FOREIGN KEY (status_id) REFERENCES th_workflow_statuses(id) ON DELETE SET NULL,
  CONSTRAINT fk_th_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES th_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_th_tasks_creator FOREIGN KEY (created_by) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_subtasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NULL,
  title TEXT NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  assignee_id INT NULL,
  due_date DATE NULL,
  KEY idx_th_subtasks_assignee (assignee_id),
  CONSTRAINT fk_th_subtasks_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_subtasks_user FOREIGN KEY (assignee_id) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_task_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NULL,
  user_id INT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_th_tc_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_tc_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_task_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NULL,
  user_id INT NULL,
  type VARCHAR(30) NOT NULL,
  from_value VARCHAR(200) NULL,
  to_value VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_activity_task (task_id),
  CONSTRAINT fk_th_ta_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_ta_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  actor_id INT NULL,
  type VARCHAR(30) NOT NULL,
  task_id INT NULL,
  project_id INT NULL,
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  read_at DATETIME NULL,
  archived_at DATETIME NULL,
  snoozed_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_notif_user (user_id, archived_at),
  CONSTRAINT fk_th_notif_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_notif_actor FOREIGN KEY (actor_id) REFERENCES th_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_th_notif_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_notif_project FOREIGN KEY (project_id) REFERENCES th_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_day_plan_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  plan_date DATE NOT NULL,
  task_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  period VARCHAR(8) NOT NULL DEFAULT 'manha',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_th_day_plan (user_id, plan_date, task_id),
  KEY idx_th_day_plan_user (user_id, plan_date),
  CONSTRAINT fk_th_day_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_day_task FOREIGN KEY (task_id) REFERENCES th_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_day_closures (
  user_id INT NOT NULL,
  plan_date DATE NOT NULL,
  summary TEXT NOT NULL,
  closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, plan_date),
  CONSTRAINT fk_th_close_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_job_runs (
  name VARCHAR(60) NOT NULL,
  run_key VARCHAR(60) NOT NULL,
  ran_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (name, run_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_routine_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  weekday SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NULL,
  label VARCHAR(200) NOT NULL,
  icon VARCHAR(10) NULL,
  category_id INT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  week_of_month SMALLINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_routine_user (user_id),
  CONSTRAINT fk_th_routine_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_th_routine_cat FOREIGN KEY (category_id) REFERENCES th_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_routine_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  routine_block_id INT NOT NULL,
  check_date DATE NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_th_routine_check (routine_block_id, check_date),
  CONSTRAINT fk_th_rcheck_block FOREIGN KEY (routine_block_id) REFERENCES th_routine_blocks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_reminders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  reminder_date DATE NOT NULL,
  reminder_time TIME NOT NULL,
  title VARCHAR(300) NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  notified TINYINT(1) NOT NULL DEFAULT 0,
  `repeat_kind` VARCHAR(12) NOT NULL DEFAULT 'none',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_th_reminders_user (user_id),
  CONSTRAINT fk_th_rem_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_personal_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(300) NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  color VARCHAR(12) NOT NULL DEFAULT 'none',
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_th_notes_user (user_id, pinned, updated_at),
  CONSTRAINT fk_th_notes_user FOREIGN KEY (user_id) REFERENCES th_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS th_access_profiles (
  `key` VARCHAR(40) PRIMARY KEY,
  label VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  permissions JSON NOT NULL,
  system TINYINT(1) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 100
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO th_access_profiles (`key`, label, description, permissions, system, position) VALUES
  ('admin', 'Administrador', 'Cria setores, cadastra pessoas e define perfis. Não vê projetos, tarefas nem o trabalho dos setores.', '["gerenciar_pessoas_todas"]', 1, 1),
  ('gestor', 'Gestor', 'Vê o próprio trabalho e o das equipes e setores que gerencia, e cria equipes, projetos e tarefas.', '["criar_corporativo","criar_equipes","ver_painel_equipe"]', 1, 2),
  ('diretoria', 'Diretoria', 'Vê o trabalho dos setores que acompanha e o próprio, e cria projetos e tarefas.', '["criar_corporativo","ver_painel_equipe"]', 1, 3),
  ('colaborador', 'Colaborador', 'Vê os projetos e tarefas em que foi incluído e organiza os próprios no espaço Individual.', '[]', 1, 4);

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem) VALUES
  ('taskhub', 'TaskHub', 23);
