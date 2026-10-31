-- Compartilhar gestão do formulário (ver/editar) e histórico de operações
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS pesquisas_formulario_acessos (
  formulario_id INT NOT NULL,
  usuario_id INT NOT NULL,
  papel ENUM('ver','editar') NOT NULL DEFAULT 'ver',
  PRIMARY KEY (formulario_id, usuario_id),
  KEY idx_pesquisas_acesso_usuario (usuario_id),
  CONSTRAINT fk_pesquisas_acesso_form
    FOREIGN KEY (formulario_id) REFERENCES pesquisas_formularios(id) ON DELETE CASCADE,
  CONSTRAINT fk_pesquisas_acesso_user
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pesquisas_formulario_historico (
  id INT AUTO_INCREMENT PRIMARY KEY,
  formulario_id INT NOT NULL,
  usuario_id INT NULL,
  acao VARCHAR(40) NOT NULL,
  detalhe VARCHAR(255) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pesquisas_hist_form (formulario_id, criado_em),
  CONSTRAINT fk_pesquisas_hist_form
    FOREIGN KEY (formulario_id) REFERENCES pesquisas_formularios(id) ON DELETE CASCADE,
  CONSTRAINT fk_pesquisas_hist_user
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
