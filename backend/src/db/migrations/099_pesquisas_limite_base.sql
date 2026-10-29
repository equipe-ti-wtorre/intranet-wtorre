-- Limite por campo: convidado informa de 1 até o valor da planilha
-- Idempotente: o migrate reexecuta os .sql

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_perguntas'
    AND COLUMN_NAME = 'limite_base'
);
SET @sql := IF(
    @col = 0,
    'ALTER TABLE pesquisas_perguntas ADD COLUMN limite_base TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
