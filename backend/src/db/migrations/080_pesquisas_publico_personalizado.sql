-- Público-alvo personalizado: destinatários internos por usuário
-- Idempotente: o migrate reexecuta os .sql

SET @enum_pers := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pesquisas_formularios'
    AND COLUMN_NAME = 'publico_alvo'
    AND COLUMN_TYPE LIKE '%personalizado%'
);
SET @sql_enum := IF(
    @enum_pers = 0,
    'ALTER TABLE pesquisas_formularios MODIFY COLUMN publico_alvo ENUM(''todos'',''departamento'',''externos'',''personalizado'') NOT NULL DEFAULT ''todos''',
    'SELECT 1'
);
PREPARE stmt_enum FROM @sql_enum;
EXECUTE stmt_enum;
DEALLOCATE PREPARE stmt_enum;

CREATE TABLE IF NOT EXISTS pesquisas_formulario_destinatarios (
  formulario_id INT NOT NULL,
  usuario_id INT NOT NULL,
  PRIMARY KEY (formulario_id, usuario_id),
  KEY idx_pesquisas_dest_usuario (usuario_id),
  CONSTRAINT fk_pesquisas_dest_form
    FOREIGN KEY (formulario_id) REFERENCES pesquisas_formularios(id) ON DELETE CASCADE,
  CONSTRAINT fk_pesquisas_dest_user
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
