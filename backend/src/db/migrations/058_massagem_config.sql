-- Config de alertas de teste do módulo Massagem / Bem-estar

CREATE TABLE IF NOT EXISTS massagem_config (
  id INT NOT NULL PRIMARY KEY,
  emails_teste JSON NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO massagem_config (id, emails_teste) VALUES (1, JSON_ARRAY());
