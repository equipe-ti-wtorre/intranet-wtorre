const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const router = require('./pesquisas.routes');

function listRoutes(stack) {
  const out = [];
  for (const layer of stack || []) {
    if (layer.route) {
      out.push({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
      });
    }
  }
  return out;
}

describe('pesquisas.routes', () => {
  it('registra GET /admin/erros', () => {
    const routes = listRoutes(router.stack);
    const found = routes.find((r) => r.path === '/admin/erros' && r.methods.includes('get'));
    assert.ok(found, 'GET /admin/erros deve existir no router');
  });

  it('mantém GET /admin/carrossel e POST clonar', () => {
    const routes = listRoutes(router.stack);
    assert.ok(routes.some((r) => r.path === '/admin/carrossel' && r.methods.includes('get')));
    assert.ok(routes.some((r) => r.path === '/formularios/:id/clonar' && r.methods.includes('post')));
  });


  it('registra POST /formularios/:id/base', () => {
    const routes = listRoutes(router.stack);
    const found = routes.find(
      (r) => r.path === '/formularios/:id/base' && r.methods.includes('post')
    );
    assert.ok(found, 'POST /formularios/:id/base deve existir no router');
  });


  it('registra GET e PUT /formularios/:id/acessos e GET historico', () => {
    const routes = listRoutes(router.stack);
    assert.ok(routes.some((r) => r.path === '/formularios/:id/acessos' && r.methods.includes('get')));
    assert.ok(routes.some((r) => r.path === '/formularios/:id/acessos' && r.methods.includes('put')));
    assert.ok(routes.some((r) => r.path === '/formularios/:id/historico' && r.methods.includes('get')));
  });
  it('registra GET /formularios/:id/export.xlsx', () => {
    const routes = listRoutes(router.stack);
    const found = routes.find(
      (r) => r.path === '/formularios/:id/export.xlsx' && r.methods.includes('get')
    );
    assert.ok(found, 'GET /formularios/:id/export.xlsx deve existir no router');
  });
  it('registra GET /local-blob/:blob', () => {
    const routes = listRoutes(router.stack);
    const found = routes.find((r) => r.path === '/local-blob/:blob' && r.methods.includes('get'));
    assert.ok(found, 'GET /local-blob/:blob deve existir no router');
  });
});
