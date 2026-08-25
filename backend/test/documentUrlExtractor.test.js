const test = require('node:test');
const assert = require('node:assert/strict');
const { collectUrls } = require('../infrastructure/documentUrlExtractor');

test('extrae únicamente URLs HTTPS completas del contenido', () => {
  assert.deepEqual(collectUrls('Verificar: https://verify.example/c/AST-2026-8812.'), ['https://verify.example/c/AST-2026-8812.']);
  assert.deepEqual(collectUrls('http://inseguro.example'), []);
});
