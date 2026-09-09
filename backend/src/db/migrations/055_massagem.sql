-- Massagem / Bem-estar: eventos, reservas, fila, empresas e layout

CREATE TABLE IF NOT EXISTS massagem_empresas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nm VARCHAR(255) NOT NULL,
  cor VARCHAR(32) NOT NULL DEFAULT '#6B7280',
  email VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_massagem_empresas_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS massagem_layout (
  id INT NOT NULL PRIMARY KEY,
  brand_nome VARCHAR(120) NOT NULL DEFAULT 'Bem-estar · Massagem',
  brand_icone VARCHAR(64) NOT NULL DEFAULT 'leaf',
  home_eyebrow VARCHAR(120) NOT NULL DEFAULT 'Programa ativo',
  home_titulo VARCHAR(255) NOT NULL DEFAULT 'Reserve sua sessão',
  home_titulo_complemento VARCHAR(80) NOT NULL DEFAULT 'de',
  home_titulo_destaque VARCHAR(80) NOT NULL DEFAULT 'bem-estar',
  home_subtitulo VARCHAR(512) NOT NULL DEFAULT 'Escolha o evento e garanta seu horário. Totalmente confidencial.',
  home_chips JSON NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS massagem_eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nm VARCHAR(255) NOT NULL,
  masso VARCHAR(255) NOT NULL,
  local VARCHAR(255) NOT NULL,
  unidade VARCHAR(255) NOT NULL,
  data DATE NOT NULL,
  horarios JSON NOT NULL,
  status ENUM('ativo','inativo') NOT NULL DEFAULT 'inativo',
  duracao_min INT NOT NULL DEFAULT 50,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_massagem_eventos_status_data (status, data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS massagem_reservas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evento_id INT NOT NULL,
  data DATE NOT NULL,
  hora VARCHAR(8) NOT NULL,
  user_id INT NULL,
  email VARCHAR(255) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  status ENUM('ok','presente','falta') NOT NULL DEFAULT 'ok',
  observacao VARCHAR(500) NULL,
  lembrete_enviado TINYINT(1) NOT NULL DEFAULT 0,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_massagem_reserva_slot (evento_id, data, hora),
  KEY idx_massagem_reservas_email (email),
  KEY idx_massagem_reservas_evento (evento_id),
  KEY idx_massagem_reservas_lembrete (lembrete_enviado, status, data),
  CONSTRAINT fk_massagem_reservas_evento
    FOREIGN KEY (evento_id) REFERENCES massagem_eventos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS massagem_fila (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evento_id INT NOT NULL,
  user_id INT NULL,
  email VARCHAR(255) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_massagem_fila_evento_email (evento_id, email),
  KEY idx_massagem_fila_evento (evento_id),
  CONSTRAINT fk_massagem_fila_evento
    FOREIGN KEY (evento_id) REFERENCES massagem_eventos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO massagem_layout (
  id, brand_nome, brand_icone,
  home_eyebrow, home_titulo, home_titulo_complemento, home_titulo_destaque, home_subtitulo,
  home_chips
) VALUES (
  1,
  'Bem-estar · Massagem',
  'leaf',
  'Programa ativo',
  'Reserve sua sessão',
  'de',
  'bem-estar',
  'Escolha o evento e garanta seu horário. Totalmente confidencial.',
  JSON_ARRAY(
    JSON_OBJECT('icone', 'lightning', 'texto', 'Confirmação imediata'),
    JSON_OBJECT('icone', 'arrows-clockwise', 'texto', 'Troca de horário livre')
  )
);

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem) VALUES
  ('massagem', 'Massagem', 17);
