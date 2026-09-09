-- Listas de e-mail por empresa (disparo de sessão de massagem)

CREATE TABLE IF NOT EXISTS massagem_email_listas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  nome VARCHAR(255) NOT NULL,
  descricao VARCHAR(500) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_massagem_email_listas_empresa (empresa_id),
  CONSTRAINT fk_massagem_email_listas_empresa
    FOREIGN KEY (empresa_id) REFERENCES massagem_empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS massagem_email_lista_itens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lista_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  nome VARCHAR(255) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_massagem_email_lista_item (lista_id, email),
  KEY idx_massagem_email_lista_itens_lista (lista_id),
  CONSTRAINT fk_massagem_email_lista_itens_lista
    FOREIGN KEY (lista_id) REFERENCES massagem_email_listas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO massagem_email_listas (empresa_id, nome)
SELECT e.id, CONCAT(e.nm, ' - LISTA')
FROM massagem_empresas e
WHERE e.email IS NOT NULL AND TRIM(e.email) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM massagem_email_listas l WHERE l.empresa_id = e.id
  );

INSERT IGNORE INTO massagem_email_lista_itens (lista_id, email)
SELECT l.id, e.email
FROM massagem_email_listas l
INNER JOIN massagem_empresas e ON e.id = l.empresa_id
WHERE e.email IS NOT NULL AND TRIM(e.email) <> '';
