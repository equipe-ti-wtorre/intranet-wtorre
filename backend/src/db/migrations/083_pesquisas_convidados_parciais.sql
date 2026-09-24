-- Convidado pode ter só nome, só documento ou só e-mail.
-- Idempotente: o migrate reexecuta os .sql.

SET @email_nn := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_convidados' AND COLUMN_NAME = 'email'
);
SET @sql_email := IF(
  @email_nn = 'NO',
  'ALTER TABLE pesquisas_convidados MODIFY email VARCHAR(200) NULL',
  'SELECT 1'
);
PREPARE stmt_email FROM @sql_email;
EXECUTE stmt_email;
DEALLOCATE PREPARE stmt_email;

SET @hash_nn := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_convidados' AND COLUMN_NAME = 'cpf_hash'
);
SET @sql_hash := IF(
  @hash_nn = 'NO',
  'ALTER TABLE pesquisas_convidados MODIFY cpf_hash CHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt_hash FROM @sql_hash;
EXECUTE stmt_hash;
DEALLOCATE PREPARE stmt_hash;

SET @mask_nn := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_convidados' AND COLUMN_NAME = 'cpf_mascara'
);
SET @sql_mask := IF(
  @mask_nn = 'NO',
  'ALTER TABLE pesquisas_convidados MODIFY cpf_mascara VARCHAR(20) NULL',
  'SELECT 1'
);
PREPARE stmt_mask FROM @sql_mask;
EXECUTE stmt_mask;
DEALLOCATE PREPARE stmt_mask;
