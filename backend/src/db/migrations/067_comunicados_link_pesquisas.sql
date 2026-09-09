-- Comunicados: link para formulários publicados da Central de Pesquisas
-- Idempotente: o migrate reexecuta os .sql

SET @col_link := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'comunicados'
    AND COLUMN_NAME = 'link_path'
);
SET @sql_link := IF(
    @col_link = 0,
    'ALTER TABLE comunicados ADD COLUMN link_path VARCHAR(300) NULL',
    'SELECT 1'
);
PREPARE stmt_link FROM @sql_link;
EXECUTE stmt_link;
DEALLOCATE PREPARE stmt_link;

SET @col_origem := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'comunicados'
    AND COLUMN_NAME = 'origem'
);
SET @sql_origem := IF(
    @col_origem = 0,
    'ALTER TABLE comunicados ADD COLUMN origem VARCHAR(40) NULL',
    'SELECT 1'
);
PREPARE stmt_origem FROM @sql_origem;
EXECUTE stmt_origem;
DEALLOCATE PREPARE stmt_origem;

SET @col_origem_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'comunicados'
    AND COLUMN_NAME = 'origem_id'
);
SET @sql_origem_id := IF(
    @col_origem_id = 0,
    'ALTER TABLE comunicados ADD COLUMN origem_id INT NULL',
    'SELECT 1'
);
PREPARE stmt_origem_id FROM @sql_origem_id;
EXECUTE stmt_origem_id;
DEALLOCATE PREPARE stmt_origem_id;

SET @idx_origem := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'comunicados'
    AND INDEX_NAME = 'uk_comunicados_origem'
);
SET @sql_idx := IF(
    @idx_origem = 0,
    'ALTER TABLE comunicados ADD UNIQUE KEY uk_comunicados_origem (origem, origem_id)',
    'SELECT 1'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

INSERT INTO comunicado_categorias (nome, slug, cor, ordem, ativo)
SELECT 'Pesquisas', 'pesquisas', '#2f52e0', 5, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM comunicado_categorias WHERE slug = 'pesquisas' LIMIT 1);
