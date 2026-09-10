-- Layout da capa (topo/rodapé/esquerda/direita) + blocos do construtor
-- Idempotente: o migrate reexecuta os .sql

SET @col_layout := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'capa_layout'
);
SET @sql_layout := IF(
    @col_layout = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN capa_layout ENUM(''top'',''bottom'',''left'',''right'') NOT NULL DEFAULT ''top''',
    'SELECT 1'
);
PREPARE stmt_layout FROM @sql_layout;
EXECUTE stmt_layout;
DEALLOCATE PREPARE stmt_layout;

SET @col_bloco := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_perguntas' AND COLUMN_NAME = 'bloco_tipo'
);
SET @sql_bloco := IF(
    @col_bloco = 0,
    'ALTER TABLE pesquisas_perguntas ADD COLUMN bloco_tipo ENUM(''pergunta'',''texto'',''anexo'') NOT NULL DEFAULT ''pergunta''',
    'SELECT 1'
);
PREPARE stmt_bloco FROM @sql_bloco;
EXECUTE stmt_bloco;
DEALLOCATE PREPARE stmt_bloco;

SET @col_ajuda := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_perguntas' AND COLUMN_NAME = 'ajuda'
);
SET @sql_ajuda := IF(
    @col_ajuda = 0,
    'ALTER TABLE pesquisas_perguntas ADD COLUMN ajuda VARCHAR(500) NULL',
    'SELECT 1'
);
PREPARE stmt_ajuda FROM @sql_ajuda;
EXECUTE stmt_ajuda;
DEALLOCATE PREPARE stmt_ajuda;

SET @col_nova := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_perguntas' AND COLUMN_NAME = 'nova_linha'
);
SET @sql_nova := IF(
    @col_nova = 0,
    'ALTER TABLE pesquisas_perguntas ADD COLUMN nova_linha TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
);
PREPARE stmt_nova FROM @sql_nova;
EXECUTE stmt_nova;
DEALLOCATE PREPARE stmt_nova;
