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
});
