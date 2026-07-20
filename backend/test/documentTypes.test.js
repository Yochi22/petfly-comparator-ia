const test = require('node:test');
const assert = require('node:assert/strict');
const { detectDocType } = require('../lib/documentTypes');

test('detecta variantes de Certificación ADI', () => {
  const filenames = [
    'Certificación ADI.pdf',
    'certificacion_adi CLIENTE.pdf',
    'CERTIFICADO DE ADI - Luna.pdf',
    'Certificate ADI Max.pdf',
  ];

  for (const filename of filenames) {
    assert.equal(detectDocType(filename), 'CERTIFICACION_ADI', filename);
  }
});

test('Carnet ADI tiene precedencia sobre Carnet y ADI', () => {
  assert.equal(detectDocType('Carnet ADI - Luna.pdf'), 'CARNET_ADI');
});
