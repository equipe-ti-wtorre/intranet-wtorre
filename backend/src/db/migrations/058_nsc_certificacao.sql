CREATE TABLE IF NOT EXISTS nsc_envio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ad_object_id VARCHAR(64) NOT NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  caminho_storage VARCHAR(512) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  tamanho INT NOT NULL,
  data_emissao DATE NULL,
  validade DATE NULL,
  enviado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vigente TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_nsc_envio_ad (ad_object_id),
  KEY idx_nsc_envio_ad_vigente (ad_object_id, vigente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS nsc_certificacao (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ad_object_id VARCHAR(64) NOT NULL,
  sam_account_name VARCHAR(120) NULL,
  obrigatorio_override TINYINT(1) NULL,
  arquivo_id INT NULL,
  data_emissao DATE NULL,
  validade_manual DATE NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_nsc_cert_ad (ad_object_id),
  KEY idx_nsc_cert_arquivo (arquivo_id),
  CONSTRAINT fk_nsc_cert_arquivo FOREIGN KEY (arquivo_id) REFERENCES nsc_envio(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS nsc_regra_departamento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  departamento_ou VARCHAR(200) NOT NULL,
  obrigatorio TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_nsc_regra_depto (departamento_ou)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS nsc_config (
  id INT NOT NULL PRIMARY KEY,
  meses_validade_padrao INT NOT NULL DEFAULT 12,
  antecedencias_aviso VARCHAR(255) NOT NULL DEFAULT '[30,15,7]',
  notificar_colaborador TINYINT(1) NOT NULL DEFAULT 1,
  notificar_gestor TINYINT(1) NOT NULL DEFAULT 1,
  resumo_semanal_rh TINYINT(1) NOT NULL DEFAULT 0,
  sinalizar_operacao TINYINT(1) NOT NULL DEFAULT 1,
  permitir_validade_manual TINYINT(1) NOT NULL DEFAULT 0,
  emails_rh TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS nsc_notificacao_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ad_object_id VARCHAR(64) NOT NULL,
  tipo VARCHAR(80) NOT NULL,
  destinatario VARCHAR(200) NOT NULL,
  enviado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(40) NOT NULL DEFAULT 'enviado',
  KEY idx_nsc_notif_dup (ad_object_id, tipo, destinatario, enviado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO nsc_config (
  id, meses_validade_padrao, antecedencias_aviso,
  notificar_colaborador, notificar_gestor, resumo_semanal_rh, sinalizar_operacao,
  permitir_validade_manual, emails_rh
) VALUES (
  1, 12, '[30,15,7]',
  1, 1, 0, 1,
  0, '[]'
);

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem) VALUES
  ('nao-se-cale', 'Não se Cale', 18);

INSERT INTO menu_items (label, url, parent_id, ordem, abrir_nova_aba, icone, cabecalho, ativo, visivel_perfil)
SELECT 'Não se Cale', '/nao-se-cale', NULL, calc.novo_ordem,
  0, NULL, NULL, 1, NULL
FROM (
  SELECT COALESCE(MAX(ordem) + 1, 1) AS novo_ordem
  FROM menu_items
  WHERE parent_id IS NULL
) AS calc
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM menu_items WHERE url = '/nao-se-cale') AS chk
);
