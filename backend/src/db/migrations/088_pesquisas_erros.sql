-- Logs de erro da Central de Formulários (clonar, publicar, capa, salvar, responder)
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS pesquisas_erros (
  id INT AUTO_INCREMENT PRIMARY KEY,
  acao ENUM('clonar','publicar','capa','salvar','responder') NOT NULL,
  formulario_id INT NULL,
  user_id INT NULL,
  email VARCHAR(200) NULL,
  http_status SMALLINT NOT NULL DEFAULT 500,
  codigo VARCHAR(80) NULL,
  passo VARCHAR(80) NULL,
  mensagem VARCHAR(500) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pesquisas_erros_criado (criado_em),
  KEY idx_pesquisas_erros_acao (acao),
  KEY idx_pesquisas_erros_form (formulario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
