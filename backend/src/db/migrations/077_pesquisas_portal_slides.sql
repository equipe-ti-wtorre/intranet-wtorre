-- Carrossel da porta pública de pesquisas (identificação do convidado)
-- Idempotente: o migrate reexecuta os .sql

CREATE TABLE IF NOT EXISTS pesquisas_portal_slides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ordem INT NOT NULL DEFAULT 0,
  titulo VARCHAR(200) NULL,
  imagem_url VARCHAR(1024) NULL,
  container VARCHAR(63) NULL,
  arquivo_blob VARCHAR(255) NULL,
  arquivo_nome VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pesquisas_portal_slides_ordem (ativo, ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO pesquisas_portal_slides (ordem, titulo, imagem_url, ativo)
SELECT s.ordem, NULL, s.imagem_url, 1
FROM (
  SELECT 0 AS ordem, 'https://bid.nubankparque.com/assets/login-carousel/01-henrique-juliano.png' AS imagem_url
  UNION ALL SELECT 1, 'https://bid.nubankparque.com/assets/login-carousel/02-gilberto-gil.png'
  UNION ALL SELECT 2, 'https://bid.nubankparque.com/assets/login-carousel/03-gusttavo-lima.png'
  UNION ALL SELECT 3, 'https://bid.nubankparque.com/assets/login-carousel/04-show-azul.png'
  UNION ALL SELECT 4, 'https://bid.nubankparque.com/assets/login-carousel/05-allianz-parque.png'
  UNION ALL SELECT 5, 'https://bid.nubankparque.com/assets/login-carousel/06-show-fisheye.png'
  UNION ALL SELECT 6, 'https://bid.nubankparque.com/assets/login-carousel/07-show-spotlights.png'
  UNION ALL SELECT 7, 'https://bid.nubankparque.com/assets/login-carousel/08-crowd-brasil.png'
  UNION ALL SELECT 8, 'https://bid.nubankparque.com/assets/login-carousel/09-show-telas.png'
  UNION ALL SELECT 9, 'https://bid.nubankparque.com/assets/login-carousel/10-show-azul-2.png'
  UNION ALL SELECT 10, 'https://bid.nubankparque.com/assets/login-carousel/11-kings-league.png'
  UNION ALL SELECT 11, 'https://bid.nubankparque.com/assets/login-carousel/12-pirotecnia.png'
) s
WHERE NOT EXISTS (SELECT 1 FROM pesquisas_portal_slides x);
