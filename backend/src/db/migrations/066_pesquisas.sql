-- Central de Pesquisas: formulários, respostas e requisições

CREATE TABLE IF NOT EXISTS pesquisas_formularios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  criador_id INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT NULL,
  categoria VARCHAR(80) NOT NULL DEFAULT 'Outro',
  prazo DATE NULL,
  publico_alvo ENUM('todos','departamento','externos') NOT NULL DEFAULT 'todos',
  publico_departamento VARCHAR(200) NULL,
  tipo ENUM('basico','avancado') NOT NULL DEFAULT 'basico',
  status ENUM('rascunho','publicado','encerrado') NOT NULL DEFAULT 'rascunho',
  secoes TINYINT(1) NOT NULL DEFAULT 0,
  logica_condicional TINYINT(1) NOT NULL DEFAULT 0,
  anonimo TINYINT(1) NOT NULL DEFAULT 0,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pesquisas_form_criador (criador_id),
  KEY idx_pesquisas_form_status (status),
  KEY idx_pesquisas_form_prazo (prazo),
  CONSTRAINT fk_pesquisas_form_criador
    FOREIGN KEY (criador_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pesquisas_perguntas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  formulario_id INT NOT NULL,
  ordem INT NOT NULL,
  texto VARCHAR(500) NOT NULL,
  tipo ENUM('texto_curto','texto_longo','multipla_escolha','escala','sim_nao') NOT NULL DEFAULT 'texto_curto',
  obrigatoria TINYINT(1) NOT NULL DEFAULT 1,
  opcoes JSON NULL,
  secao_titulo VARCHAR(200) NULL,
  logica JSON NULL,
  KEY idx_pesquisas_perguntas_form (formulario_id, ordem),
  CONSTRAINT fk_pesquisas_perguntas_form
    FOREIGN KEY (formulario_id) REFERENCES pesquisas_formularios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pesquisas_respostas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  formulario_id INT NOT NULL,
  usuario_id INT NOT NULL,
  enviado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pesquisas_resposta_user (formulario_id, usuario_id),
  KEY idx_pesquisas_respostas_user (usuario_id),
  CONSTRAINT fk_pesquisas_respostas_form
    FOREIGN KEY (formulario_id) REFERENCES pesquisas_formularios(id) ON DELETE CASCADE,
  CONSTRAINT fk_pesquisas_respostas_user
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pesquisas_resposta_itens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resposta_id INT NOT NULL,
  pergunta_id INT NOT NULL,
  valor TEXT NULL,
  KEY idx_pesquisas_itens_resposta (resposta_id),
  KEY idx_pesquisas_itens_pergunta (pergunta_id),
  CONSTRAINT fk_pesquisas_itens_resposta
    FOREIGN KEY (resposta_id) REFERENCES pesquisas_respostas(id) ON DELETE CASCADE,
  CONSTRAINT fk_pesquisas_itens_pergunta
    FOREIGN KEY (pergunta_id) REFERENCES pesquisas_perguntas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pesquisas_requisicoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  criador_id INT NOT NULL,
  tipo ENUM('compra','ti','rh','manutencao','outro') NOT NULL DEFAULT 'outro',
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT NULL,
  prioridade ENUM('baixa','media','alta') NOT NULL DEFAULT 'media',
  prazo DATE NULL,
  aprovador_usuario_id INT NULL,
  aprovador_rotulo VARCHAR(80) NULL,
  observacoes VARCHAR(500) NULL,
  anexo_container VARCHAR(63) NULL,
  anexo_blob VARCHAR(255) NULL,
  anexo_nome VARCHAR(255) NULL,
  status ENUM('rascunho','pendente','em_andamento','concluida','rejeitada') NOT NULL DEFAULT 'pendente',
  decidido_em DATETIME NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pesquisas_req_criador (criador_id),
  KEY idx_pesquisas_req_aprovador (aprovador_usuario_id),
  KEY idx_pesquisas_req_status (status),
  CONSTRAINT fk_pesquisas_req_criador
    FOREIGN KEY (criador_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pesquisas_req_aprovador
    FOREIGN KEY (aprovador_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem) VALUES
  ('pesquisas', 'Central de Pesquisas', 18);
