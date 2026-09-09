-- Várias listas por empresa (idempotente: o migrate reexecuta os .sql)
-- A FK em empresa_id exige um índice: criar o não-único ANTES de dropar o UNIQUE.

SET @idx2 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_email_listas'
    AND INDEX_NAME = 'idx_massagem_email_listas_empresa'
);
SET @sql2 := IF(
  @idx2 = 0,
  'ALTER TABLE massagem_email_listas ADD KEY idx_massagem_email_listas_empresa (empresa_id)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_email_listas'
    AND INDEX_NAME = 'uk_massagem_email_listas_empresa'
);
SET @sql := IF(
  @idx > 0,
  'ALTER TABLE massagem_email_listas DROP INDEX uk_massagem_email_listas_empresa',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
