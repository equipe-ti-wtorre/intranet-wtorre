-- Vários templates por tipo/código (idempotente: o migrate reexecuta os .sql)
-- Criar o índice não-único ANTES de dropar o UNIQUE.

SET @idx2 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_email_templates'
    AND INDEX_NAME = 'idx_massagem_email_templates_codigo'
);
SET @sql2 := IF(
  @idx2 = 0,
  'ALTER TABLE massagem_email_templates ADD KEY idx_massagem_email_templates_codigo (codigo)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_email_templates'
    AND INDEX_NAME = 'uk_massagem_email_templates_codigo'
);
SET @sql := IF(
  @idx > 0,
  'ALTER TABLE massagem_email_templates DROP INDEX uk_massagem_email_templates_codigo',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
