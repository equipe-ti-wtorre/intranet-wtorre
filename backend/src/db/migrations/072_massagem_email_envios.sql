-- Histórico de envios de e-mail da massagem (disparo + transacionais)

CREATE TABLE IF NOT EXISTS massagem_email_envios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo VARCHAR(40) NOT NULL,
  origem VARCHAR(40) NOT NULL,
  modo ENUM('lista', 'teste', 'direto') NOT NULL DEFAULT 'direto',
  evento_id INT NULL,
  evento_nm VARCHAR(255) NULL,
  evento_data DATE NULL,
  assunto VARCHAR(255) NULL,
  total INT NOT NULL DEFAULT 0,
  enviados INT NOT NULL DEFAULT 0,
  falhas INT NOT NULL DEFAULT 0,
  status ENUM('enviando', 'ok', 'parcial', 'erro') NOT NULL DEFAULT 'enviando',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_massagem_email_envios_criado (criado_em),
  KEY idx_massagem_email_envios_tipo (tipo),
  KEY idx_massagem_email_envios_evento (evento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS massagem_email_envio_destinos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  envio_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  nome VARCHAR(255) NULL,
  status ENUM('enviado', 'falha') NOT NULL DEFAULT 'enviado',
  erro TEXT NULL,
  message_id VARCHAR(255) NULL,
  enviado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_massagem_email_envio_destinos_envio (envio_id),
  KEY idx_massagem_email_envio_destinos_email (email),
  CONSTRAINT fk_massagem_email_envio_destinos_envio
    FOREIGN KEY (envio_id) REFERENCES massagem_email_envios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
