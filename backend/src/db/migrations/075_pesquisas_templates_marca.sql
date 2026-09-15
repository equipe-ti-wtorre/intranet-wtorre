-- Alinha os templates oficiais às cores de marca WTorre / Nubank Parque.
-- Idempotente: o migrate reexecuta os .sql.

UPDATE pesquisas_templates
SET cor_primaria = '#1d54e6', cor_primaria_escura = '#0b2a6b'
WHERE codigo = 'wtorre';

UPDATE pesquisas_templates
SET cor_primaria = '#8a05be', cor_primaria_escura = '#63038c'
WHERE codigo = 'nubank';
