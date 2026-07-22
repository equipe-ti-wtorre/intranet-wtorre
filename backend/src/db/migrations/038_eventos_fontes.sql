CREATE TABLE IF NOT EXISTS eventos_fontes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  codigo          VARCHAR(50) NOT NULL UNIQUE,
  nome            VARCHAR(120) NOT NULL,
  url             VARCHAR(500) NOT NULL,
  parser_tipo     VARCHAR(50) NOT NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  ordem           INT NOT NULL DEFAULT 0,
  limite          INT NULL,
  config_json     JSON NULL,
  logo_url        VARCHAR(500) NULL,
  rotulo          VARCHAR(60) NULL,
  criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_eventos_fontes_ativo_ordem (ativo, ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem) VALUES
  ('eventos', 'Eventos', 13);

INSERT IGNORE INTO eventos_fontes (codigo, nome, url, parser_tipo, ativo, ordem, limite) VALUES
  (
    'nubankparque-agenda',
    'Nubank Parque — Agenda',
    'https://nubankparque.com/?s=',
    'nubankparque_elementor',
    1,
    1,
    NULL
  );
