const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('ADI, Certificación ADI y REVISION exigen todas las ocurrencias con ubicación', () => {
  for (const documentType of ["docType === 'ADI'", "docType === 'CERTIFICACION_ADI'", "docType === 'REVISION'"]) {
    assert.ok(source.includes(documentType), documentType);
  }
  assert.ok(source.includes('encabezado, cuerpo, pie'));
  assert.ok(source.includes('document_reference.certificate_occurrences'));
  assert.ok(source.includes('CADA ocurrencia'));
});

test('REVISION conserva explícitamente sus validaciones de fechas', () => {
  assert.ok(source.includes('VALIDACIÓN DE FECHAS — MUY IMPORTANTE'));
  assert.ok(source.includes('Esta regla se agrega a las validaciones de fechas existentes; no las reemplaza.'));
});
