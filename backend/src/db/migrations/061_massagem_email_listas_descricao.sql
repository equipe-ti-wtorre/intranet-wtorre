-- Descrição opcional nas listas de e-mail (idempotente: o migrate reexecuta os .sql)

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'massagem_email_listas'
    AND COLUMN_NAME = 'descricao'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE massagem_email_listas ADD COLUMN descricao VARCHAR(500) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
