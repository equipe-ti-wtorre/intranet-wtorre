-- Janela de prazo (data/hora de início e fim)
-- Idempotente: o migrate reexecuta os .sql

SET @col_ini := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'prazo_inicio'
);
SET @sql_ini := IF(
    @col_ini = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN prazo_inicio DATETIME NULL',
    'SELECT 1'
);
PREPARE stmt_ini FROM @sql_ini;
EXECUTE stmt_ini;
DEALLOCATE PREPARE stmt_ini;

SET @col_fim := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'prazo_fim'
);
SET @sql_fim := IF(
    @col_fim = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN prazo_fim DATETIME NULL',
    'SELECT 1'
);
PREPARE stmt_fim FROM @sql_fim;
EXECUTE stmt_fim;
DEALLOCATE PREPARE stmt_fim;

UPDATE pesquisas_formularios
SET prazo_fim = TIMESTAMP(prazo, '23:59:00')
WHERE prazo IS NOT NULL AND prazo_fim IS NULL;
