INSERT IGNORE INTO modulos_admin (codigo, nome, descricao, ordem) VALUES
  ('cracha-boas-vindas', 'Crachá & Boas-vindas', 'Geração de crachá e cartão de boas-vindas do novo colaborador', 22);

INSERT INTO menu_items (label, url, parent_id, ordem, abrir_nova_aba, icone, cabecalho, ativo, visivel_perfil)
SELECT 'Crachá & Boas-vindas', '/cracha-boas-vindas', NULL, calc.novo_ordem,
  0, NULL, NULL, 1, NULL
FROM (
  SELECT COALESCE(MAX(ordem) + 1, 1) AS novo_ordem
  FROM menu_items
  WHERE parent_id IS NULL
) AS calc
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT id FROM menu_items WHERE url = '/cracha-boas-vindas') AS chk
);
