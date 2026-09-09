-- Formulários externos: slug, evento, convidados e respostas de guest
-- Idempotente: o migrate reexecuta os .sql

SET @col_slug := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'slug'
);
SET @sql_slug := IF(
    @col_slug = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN slug VARCHAR(80) NULL',
    'SELECT 1'
);
PREPARE stmt_slug FROM @sql_slug;
EXECUTE stmt_slug;
DEALLOCATE PREPARE stmt_slug;

SET @idx_slug := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND INDEX_NAME = 'uk_pesquisas_form_slug'
);
SET @sql_idx_slug := IF(
    @idx_slug = 0,
    'ALTER TABLE pesquisas_formularios ADD UNIQUE KEY uk_pesquisas_form_slug (slug)',
    'SELECT 1'
);
PREPARE stmt_idx_slug FROM @sql_idx_slug;
EXECUTE stmt_idx_slug;
DEALLOCATE PREPARE stmt_idx_slug;

SET @col_evt := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'evento_tipo'
);
SET @sql_evt := IF(
    @col_evt = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN evento_tipo VARCHAR(20) NULL',
    'SELECT 1'
);
PREPARE stmt_evt FROM @sql_evt;
EXECUTE stmt_evt;
DEALLOCATE PREPARE stmt_evt;

SET @col_evt_o := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'evento_tipo_outro'
);
SET @sql_evt_o := IF(
    @col_evt_o = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN evento_tipo_outro VARCHAR(80) NULL',
    'SELECT 1'
);
PREPARE stmt_evt_o FROM @sql_evt_o;
EXECUTE stmt_evt_o;
DEALLOCATE PREPARE stmt_evt_o;

SET @col_evt_a := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'evento_ativo'
);
SET @sql_evt_a := IF(
    @col_evt_a = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN evento_ativo TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
);
PREPARE stmt_evt_a FROM @sql_evt_a;
EXECUTE stmt_evt_a;
DEALLOCATE PREPARE stmt_evt_a;

SET @col_idchk := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pesquisas_formularios' AND COLUMN_NAME = 'exigir_identidade'
);
SET @sql_idchk := IF(
    @col_idchk = 0,
    'ALTER TABLE pesquisas_formularios ADD COLUMN exigir_identidade TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
);
PREPARE stmt_idchk FROM @sql_idchk;
EXECUTE stmt_idchk;
DEALLOCATE PREPARE stmt_idchk;

CREATE TABLE IF NOT EXISTS pesquisas_convidados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  formulario_id INT NOT NULL,
  nome VARCHAR(200) NULL,
  email VARCHAR(200) NOT NULL,
  cpf_hash CHAR(64) NOT NULL,
  cpf_mascara VARCHAR(20) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pesquisas_conv_cpf (formulario_id, cpf_hash),
  KEY idx_pesquisas_conv_form (formulario_id),
  CONSTRAINT fk_pesquisas_conv_form
    FOREIGN KEY (formulario_id) REFERENCES pesquisas_formularios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @fk_resp_user := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND CONSTRAINT_NAME = 'fk_pesquisas_respostas_user'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_drop_fk := IF(
    @fk_resp_user > 0,
    'ALTER TABLE pesquisas_respostas DROP FOREIGN KEY fk_pesquisas_respostas_user',
    'SELECT 1'
);
PREPARE stmt_drop_fk FROM @sql_drop_fk;
EXECUTE stmt_drop_fk;
DEALLOCATE PREPARE stmt_drop_fk;

-- O unique (formulario_id, usuario_id) também serve o FK de formulario_id.
-- Precisa de índice próprio em formulario_id antes de dropar o unique.
SET @idx_form := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND INDEX_NAME = 'idx_pesquisas_respostas_form'
);
SET @sql_idx_form := IF(
    @idx_form = 0,
    'ALTER TABLE pesquisas_respostas ADD KEY idx_pesquisas_respostas_form (formulario_id)',
    'SELECT 1'
);
PREPARE stmt_idx_form FROM @sql_idx_form;
EXECUTE stmt_idx_form;
DEALLOCATE PREPARE stmt_idx_form;

SET @uk_user := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND INDEX_NAME = 'uk_pesquisas_resposta_user'
);
SET @sql_drop_uk := IF(
    @uk_user > 0,
    'ALTER TABLE pesquisas_respostas DROP INDEX uk_pesquisas_resposta_user',
    'SELECT 1'
);
PREPARE stmt_drop_uk FROM @sql_drop_uk;
EXECUTE stmt_drop_uk;
DEALLOCATE PREPARE stmt_drop_uk;

SET @col_uid_null := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND COLUMN_NAME = 'usuario_id'
    AND IS_NULLABLE = 'YES'
);
SET @sql_uid := IF(
    @col_uid_null = 0,
    'ALTER TABLE pesquisas_respostas MODIFY COLUMN usuario_id INT NULL',
    'SELECT 1'
);
PREPARE stmt_uid FROM @sql_uid;
EXECUTE stmt_uid;
DEALLOCATE PREPARE stmt_uid;

SET @fk_resp_user2 := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND CONSTRAINT_NAME = 'fk_pesquisas_respostas_user'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_add_fk := IF(
    @fk_resp_user2 = 0,
    'ALTER TABLE pesquisas_respostas ADD CONSTRAINT fk_pesquisas_respostas_user FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE',
    'SELECT 1'
);
PREPARE stmt_add_fk FROM @sql_add_fk;
EXECUTE stmt_add_fk;
DEALLOCATE PREPARE stmt_add_fk;

SET @uk_user2 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND INDEX_NAME = 'uk_pesquisas_resposta_user'
);
SET @sql_uk2 := IF(
    @uk_user2 = 0,
    'ALTER TABLE pesquisas_respostas ADD UNIQUE KEY uk_pesquisas_resposta_user (formulario_id, usuario_id)',
    'SELECT 1'
);
PREPARE stmt_uk2 FROM @sql_uk2;
EXECUTE stmt_uk2;
DEALLOCATE PREPARE stmt_uk2;

SET @col_conv := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND COLUMN_NAME = 'convidado_id'
);
SET @sql_conv := IF(
    @col_conv = 0,
    'ALTER TABLE pesquisas_respostas ADD COLUMN convidado_id INT NULL',
    'SELECT 1'
);
PREPARE stmt_conv FROM @sql_conv;
EXECUTE stmt_conv;
DEALLOCATE PREPARE stmt_conv;

SET @fk_conv := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND CONSTRAINT_NAME = 'fk_pesquisas_respostas_conv'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql_fk_conv := IF(
    @fk_conv = 0,
    'ALTER TABLE pesquisas_respostas ADD CONSTRAINT fk_pesquisas_respostas_conv FOREIGN KEY (convidado_id) REFERENCES pesquisas_convidados(id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE stmt_fk_conv FROM @sql_fk_conv;
EXECUTE stmt_fk_conv;
DEALLOCATE PREPARE stmt_fk_conv;

SET @uk_conv := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_respostas'
    AND INDEX_NAME = 'uk_pesquisas_resposta_conv'
);
SET @sql_uk_conv := IF(
    @uk_conv = 0,
    'ALTER TABLE pesquisas_respostas ADD UNIQUE KEY uk_pesquisas_resposta_conv (formulario_id, convidado_id)',
    'SELECT 1'
);
PREPARE stmt_uk_conv FROM @sql_uk_conv;
EXECUTE stmt_uk_conv;
DEALLOCATE PREPARE stmt_uk_conv;
