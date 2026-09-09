-- Empresa e perfil nos usuários do tablet (idempotente: o migrate reexecuta os .sql)

SET @col_emp := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_tablet_usuarios'
    AND COLUMN_NAME = 'empresa_id'
);
SET @sql_emp := IF(
  @col_emp = 0,
  'ALTER TABLE massagem_tablet_usuarios ADD COLUMN empresa_id INT NULL',
  'SELECT 1'
);
PREPARE stmt_emp FROM @sql_emp;
EXECUTE stmt_emp;
DEALLOCATE PREPARE stmt_emp;

SET @idx_emp := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_tablet_usuarios'
    AND INDEX_NAME = 'idx_tablet_usuarios_empresa'
);
SET @sql_idx := IF(
  @idx_emp = 0,
  'ALTER TABLE massagem_tablet_usuarios ADD KEY idx_tablet_usuarios_empresa (empresa_id)',
  'SELECT 1'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

SET @fk_emp := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_tablet_usuarios'
    AND CONSTRAINT_NAME = 'fk_tablet_usuarios_empresa'
);
SET @sql_fk := IF(
  @fk_emp = 0,
  'ALTER TABLE massagem_tablet_usuarios ADD CONSTRAINT fk_tablet_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES massagem_empresas(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

SET @col_perfil := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_tablet_usuarios'
    AND COLUMN_NAME = 'perfil'
);
SET @sql_perfil := IF(
  @col_perfil = 0,
  'ALTER TABLE massagem_tablet_usuarios ADD COLUMN perfil ENUM(''ADMIN'',''USER'') NOT NULL DEFAULT ''USER''',
  'SELECT 1'
);
PREPARE stmt_perfil FROM @sql_perfil;
EXECUTE stmt_perfil;
DEALLOCATE PREPARE stmt_perfil;

UPDATE massagem_tablet_usuarios SET perfil = 'ADMIN' WHERE username = 'admin';
