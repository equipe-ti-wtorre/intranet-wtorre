CREATE TABLE IF NOT EXISTS nsc_acesso_grupo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grupo_ad_id VARCHAR(64) NOT NULL,
  grupo_nome VARCHAR(200) NOT NULL,
  grupo_descricao VARCHAR(255) NULL,
  escopo VARCHAR(40) NOT NULL DEFAULT 'global',
  departamentos_json TEXT NULL,
  pode_baixar TINYINT(1) NOT NULL DEFAULT 0,
  pode_exportar TINYINT(1) NOT NULL DEFAULT 0,
  pode_lembrar TINYINT(1) NOT NULL DEFAULT 0,
  pode_aprovar TINYINT(1) NOT NULL DEFAULT 0,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_nsc_acesso_grupo_ad (grupo_ad_id),
  KEY idx_nsc_acesso_grupo_escopo (escopo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS nsc_acesso_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  usuario_email VARCHAR(200) NULL,
  usuario_nome VARCHAR(200) NULL,
  acao VARCHAR(40) NOT NULL,
  alvo_ad_object_id VARCHAR(64) NULL,
  alvo_nome VARCHAR(200) NULL,
  detalhe VARCHAR(255) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_nsc_acesso_log_criado (criado_em),
  KEY idx_nsc_acesso_log_acao (acao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
