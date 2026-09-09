-- Templates visuais da Central de Pesquisas + capa no formulário
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS pesquisas_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL,
  nome VARCHAR(80) NOT NULL,
  wordmark VARCHAR(80) NOT NULL,
  cor_primaria VARCHAR(7) NOT NULL,
  cor_primaria_escura VARCHAR(7) NOT NULL,
  raio_px INT NOT NULL DEFAULT 10,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ordem INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pesquisas_tpl_codigo (codigo),
  KEY idx_pesquisas_tpl_ativo (ativo, ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO pesquisas_templates (codigo, nome, wordmark, cor_primaria, cor_primaria_escura, raio_px, ativo, ordem)
SELECT s.codigo, s.nome, s.wordmark, s.cor_primaria, s.cor_primaria_escura, s.raio_px, s.ativo, s.ordem
FROM (
  SELECT 'wtorre' AS codigo, 'WTorre' AS nome, 'WTORRE' AS wordmark,
         '#0f1e3d' AS cor_primaria, '#080e1e' AS cor_primaria_escura, 10 AS raio_px, 1 AS ativo, 0 AS ordem
  UNION ALL
  SELECT 'nubank', 'Nubank Parque', 'NUBANK PARQUE', '#8a05be', '#63038c', 22, 1, 1
) s
WHERE NOT EXISTS (
  SELECT 1 FROM pesquisas_templates t WHERE t.codigo = s.codigo
);

SET @col_tpl := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'template_codigo'
);
SET @sql_tpl := IF(
    @col_tpl = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN template_codigo VARCHAR(40) NOT NULL DEFAULT ''wtorre''',
    'SELECT 1'
);
PREPARE stmt_tpl FROM @sql_tpl;
EXECUTE stmt_tpl;
DEALLOCATE PREPARE stmt_tpl;

SET @col_capa_c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'capa_container'
);
SET @sql_capa_c := IF(
    @col_capa_c = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN capa_container VARCHAR(63) NULL',
    'SELECT 1'
);
PREPARE stmt_capa_c FROM @sql_capa_c;
EXECUTE stmt_capa_c;
DEALLOCATE PREPARE stmt_capa_c;

SET @col_capa_b := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'capa_blob'
);
SET @sql_capa_b := IF(
    @col_capa_b = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN capa_blob VARCHAR(255) NULL',
    'SELECT 1'
);
PREPARE stmt_capa_b FROM @sql_capa_b;
EXECUTE stmt_capa_b;
DEALLOCATE PREPARE stmt_capa_b;

SET @col_capa_n := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'capa_nome'
);
SET @sql_capa_n := IF(
    @col_capa_n = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN capa_nome VARCHAR(255) NULL',
    'SELECT 1'
);
PREPARE stmt_capa_n FROM @sql_capa_n;
EXECUTE stmt_capa_n;
DEALLOCATE PREPARE stmt_capa_n;
