-- Rótulos visíveis: módulo e categoria de comunicados passam a Formulários.
-- O seed antigo usa INSERT IGNORE / WHERE NOT EXISTS e não regrava o nome.

UPDATE modulos_admin
SET nome = 'Formulários'
WHERE codigo = 'pesquisas';

UPDATE comunicado_categorias
SET nome = 'Formulários'
WHERE slug = 'pesquisas';
