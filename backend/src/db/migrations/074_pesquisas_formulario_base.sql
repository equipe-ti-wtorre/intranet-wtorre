-- Base importada da planilha para autofill ao responder
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS pesquisas_formulario_base (
  id INT AUTO_INCREMENT PRIMARY KEY,
  formulario_id INT NOT NULL,
  chave_doc CHAR(64) NULL,
  chave_email VARCHAR(200) NULL,
  dados JSON NOT NULL,
  KEY idx_pesquisas_base_form (formulario_id),
  KEY idx_pesquisas_base_doc (formulario_id, chave_doc),
  KEY idx_pesquisas_base_email (formulario_id, chave_email),
  CONSTRAINT fk_pesquisas_base_form
    FOREIGN KEY (formulario_id) REFERENCES pesquisas_formularios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
