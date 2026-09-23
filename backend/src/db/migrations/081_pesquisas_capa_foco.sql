-- Enquadramento da capa no topo e embaixo (0–100). Idempotente: o migrate reexecuta os .sql

SET @col_foco_x := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'capa_foco_x'
);
SET @sql_foco_x := IF(
    @col_foco_x = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN capa_foco_x TINYINT UNSIGNED NOT NULL DEFAULT 50',
    'SELECT 1'
);
PREPARE stmt_foco_x FROM @sql_foco_x;
EXECUTE stmt_foco_x;
DEALLOCATE PREPARE stmt_foco_x;

SET @col_foco_y := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'capa_foco_y'
);
SET @sql_foco_y := IF(
    @col_foco_y = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN capa_foco_y TINYINT UNSIGNED NOT NULL DEFAULT 50',
    'SELECT 1'
);
PREPARE stmt_foco_y FROM @sql_foco_y;
EXECUTE stmt_foco_y;
DEALLOCATE PREPARE stmt_foco_y;
