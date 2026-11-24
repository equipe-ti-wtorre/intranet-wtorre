-- Perfil "TaskHub": libera o módulo TaskHub. Novos usuários o recebem ao serem criados
-- (users.repository.js). Aqui: cria o perfil e vincula os usuários que já existem.
-- O vínculo em massa só acontece na PRIMEIRA execução (quando o perfil ainda não existia),
-- para não desfazer ajustes manuais feitos depois pelo admin.

SET @th_novo = (SELECT COUNT(*) = 0 FROM perfis_acesso WHERE nome = 'TaskHub');

INSERT INTO perfis_acesso (nome, descricao, ativo)
SELECT 'TaskHub', 'Acesso ao módulo TaskHub', 1
WHERE @th_novo = 1;

INSERT IGNORE INTO perfil_modulos (perfil_id, modulo_codigo)
SELECT p.id, m.codigo
FROM perfis_acesso p
JOIN modulos_admin m ON m.codigo = 'taskhub'
WHERE p.nome = 'TaskHub';

INSERT IGNORE INTO usuario_perfis (usuario_id, perfil_id)
SELECT u.id, p.id
FROM usuarios u
JOIN perfis_acesso p ON p.nome = 'TaskHub'
WHERE @th_novo = 1 AND u.ativo = 1 AND u.perfil = 'USER';
