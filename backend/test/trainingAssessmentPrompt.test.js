const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('conserva las reglas históricas de Informe Entrenamiento', () => {
  for (const rule of [
    'VERIFICACIÓN DE DATOS DEL DUEÑO',
    'VERIFICACIÓN DE DATOS DEL PERRO',
    'CONSISTENCIA DEL NOMBRE DEL PERRO',
    'FECHAS:',
    'REDACCIÓN:',
  ]) assert.ok(serverSource.includes(rule), `Falta la regla: ${rule}`);
});

test('detecta diagnósticos contradictorios aunque aparezcan en propósito y alcance', () => {
  assert.ok(serverSource.includes('propósito y alcance'));
  assert.ok(serverSource.includes('unilateral hearing loss/pérdida auditiva unilateral'));
  assert.ok(serverSource.includes('DIAGNOSIS_INTERNAL_CONSISTENCY debe ser MISMATCH CRITICAL'));
});