-- RustDesk: cadastro local, órfãos do hbbs, log de sync, módulo e menu TI

CREATE TABLE IF NOT EXISTS rustdesk_dispositivo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rustdesk_id VARCHAR(32) NOT NULL,
  hostname VARCHAR(255) NULL,
  entidade_id INT NULL,
  setor VARCHAR(120) NULL,
  tipo VARCHAR(80) NULL,
  localizacao VARCHAR(255) NULL,
  modo_acesso VARCHAR(80) NULL,
  cofre_ref VARCHAR(255) NULL,
  servico_estado VARCHAR(40) NULL,
  versao_cliente VARCHAR(80) NULL,
  observacao TEXT NULL,
  criado_em_hbbs DATETIME NULL,
  ultimo_registro DATETIME NULL,
  presente_no_hbbs TINYINT(1) NOT NULL DEFAULT 0,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rd_rustdesk_id (rustdesk_id),
  KEY idx_rd_entidade (entidade_id),
  KEY idx_rd_ativo (ativo),
  KEY idx_rd_hostname (hostname),
  CONSTRAINT fk_rd_entidade FOREIGN KEY (entidade_id) REFERENCES documentos_paginas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rustdesk_peer_orfao (
  rustdesk_id VARCHAR(32) NOT NULL PRIMARY KEY,
  criado_em_hbbs DATETIME NULL,
  ultimo_registro DATETIME NULL,
  primeiro_visto_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rustdesk_sync_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  iniciado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizado_em TIMESTAMP NULL,
  sucesso TINYINT(1) NOT NULL DEFAULT 0,
  peers_lidos INT NOT NULL DEFAULT 0,
  dispositivos_atualizados INT NOT NULL DEFAULT 0,
  orfaos_novos INT NOT NULL DEFAULT 0,
  mensagem_erro TEXT NULL,
  KEY idx_rd_sync_iniciado (iniciado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem) VALUES
  ('rustdesk', 'Rust Desk', 17);

-- Agrupador TI (sem URL)
INSERT INTO menu_items (label, url, parent_id, ordem, abrir_nova_aba, icone, cabecalho, ativo, visivel_perfil)
SELECT 'TI', NULL, NULL,
  COALESCE((SELECT MAX(ordem) + 1 FROM menu_items m2 WHERE m2.parent_id IS NULL), 1),
  0, NULL, NULL, 1, NULL
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM menu_items WHERE label = 'TI' AND parent_id IS NULL AND url IS NULL
);

-- Item filho Rust Desk → /ti/rustdesk
INSERT INTO menu_items (label, url, parent_id, ordem, abrir_nova_aba, icone, cabecalho, ativo, visivel_perfil)
SELECT 'Rust Desk', '/ti/rustdesk', ti.id,
  COALESCE((SELECT MAX(m2.ordem) + 1 FROM menu_items m2 WHERE m2.parent_id = ti.id), 0),
  0, NULL, NULL, 1, NULL
FROM menu_items ti
WHERE ti.label = 'TI' AND ti.parent_id IS NULL AND ti.url IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM menu_items WHERE url = '/ti/rustdesk'
  )
LIMIT 1;
