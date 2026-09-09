CREATE TABLE IF NOT EXISTS massagem_tablet_usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  nome VARCHAR(200) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tablet_username (username)
);

CREATE TABLE IF NOT EXISTS massagem_tablet_refresh_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  device_info VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES massagem_tablet_usuarios(id) ON DELETE CASCADE,
  KEY idx_tablet_refresh_hash (token_hash),
  KEY idx_tablet_refresh_usuario (usuario_id)
);
