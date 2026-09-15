const test = require('node:test');
const assert = require('node:assert/strict');
const { detectDocType } = require('../lib/documentTypes');

test('detecta variantes de Certificación ADI', () => {
  const filenames = [
    'Certificaci\u00c3\u00b3n ADI - Laura Romero_compressed.pdf',
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

test('Training Assessment usa las reglas de Informe Entrenamiento', () => {
  assert.equal(detectDocType('Training Assessment - Luna.pdf'), 'INFORME_ENTRENAMIENTO');
  assert.equal(detectDocType('training_assessment_EN-US.pdf'), 'INFORME_ENTRENAMIENTO');
});

test('reconoce cualquier archivo terminado en Translate en-US.pdf', () => {
  assert.equal(detectDocType('Laura Romero Translate en-US.pdf'), 'MEDICAL_HISTORY_TRANSLATE');
  assert.equal(detectDocType('Medical History Translate.pdf'), 'MEDICAL_HISTORY_TRANSLATE');
});
