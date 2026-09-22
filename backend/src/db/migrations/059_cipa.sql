CREATE TABLE IF NOT EXISTS cipa_eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  data DATE NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  texto TEXT NULL,
  imagem VARCHAR(255) NULL,
  categoria VARCHAR(120) NULL,
  localizacao VARCHAR(255) NULL,
  estado ENUM('aberto', 'encerrado') NOT NULL DEFAULT 'aberto',
  duracao_slot_min INT NOT NULL DEFAULT 60,
  oculto_lista TINYINT(1) NOT NULL DEFAULT 0,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cipa_eventos_data (data),
  KEY idx_cipa_eventos_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS cipa_evento_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evento_id INT NOT NULL,
  horario TIME NOT NULL,
  vagas INT NOT NULL DEFAULT 1,
  UNIQUE KEY uk_cipa_slot_horario (evento_id, horario),
  KEY idx_cipa_slots_evento (evento_id),
  CONSTRAINT fk_cipa_slots_evento FOREIGN KEY (evento_id) REFERENCES cipa_eventos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS cipa_inscricoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slot_id INT NOT NULL,
  usuario_id INT NULL,
  nome_completo VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL,
  cpf CHAR(11) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cipa_insc_slot_cpf (slot_id, cpf),
  KEY idx_cipa_insc_usuario (usuario_id),
  KEY idx_cipa_insc_cpf (cpf),
  CONSTRAINT fk_cipa_insc_slot FOREIGN KEY (slot_id) REFERENCES cipa_evento_slots(id) ON DELETE CASCADE,
  CONSTRAINT fk_cipa_insc_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS cipa_evento_visualizadores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evento_id INT NOT NULL,
  usuario_id INT NOT NULL,
  colaborador_id INT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cipa_vis_evento_usuario (evento_id, usuario_id),
  KEY idx_cipa_vis_usuario (usuario_id),
  KEY idx_cipa_vis_colaborador (colaborador_id),
  CONSTRAINT fk_cipa_vis_evento FOREIGN KEY (evento_id) REFERENCES cipa_eventos(id) ON DELETE CASCADE,
  CONSTRAINT fk_cipa_vis_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_cipa_vis_colaborador FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem) VALUES
  ('cipa', 'CIPA', 19);

INSERT INTO menu_items (label, url, parent_id, ordem, abrir_nova_aba, icone, cabecalho, ativo, visivel_perfil)
SELECT 'CIPA', '/cipa', NULL, calc.novo_ordem,
  0, NULL, NULL, 1, NULL
FROM (
  SELECT COALESCE(MAX(ordem) + 1, 1) AS novo_ordem
  FROM menu_items
  WHERE parent_id IS NULL
) AS calc
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM menu_items WHERE url = '/cipa') AS chk
);
