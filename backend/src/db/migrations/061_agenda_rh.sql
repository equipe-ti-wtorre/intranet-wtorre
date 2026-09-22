INSERT IGNORE INTO modulos_admin (codigo, nome, ordem)
SELECT 'agenda_rh', 'Agenda RH', ordem FROM modulos_admin WHERE codigo = 'cipa';

INSERT IGNORE INTO modulos_admin (codigo, nome, ordem)
VALUES ('agenda_rh', 'Agenda RH', 19);

INSERT IGNORE INTO perfil_modulos (perfil_id, modulo_codigo)
SELECT perfil_id, 'agenda_rh' FROM perfil_modulos WHERE modulo_codigo = 'cipa';

INSERT IGNORE INTO usuario_modulos_extra (usuario_id, modulo_codigo)
SELECT usuario_id, 'agenda_rh' FROM usuario_modulos_extra WHERE modulo_codigo = 'cipa';

DELETE FROM perfil_modulos WHERE modulo_codigo = 'cipa';
DELETE FROM usuario_modulos_extra WHERE modulo_codigo = 'cipa';
DELETE FROM modulos_admin WHERE codigo = 'cipa';

UPDATE menu_items
SET url = '/agenda_rh', label = 'Agenda RH'
WHERE url = '/cipa';
