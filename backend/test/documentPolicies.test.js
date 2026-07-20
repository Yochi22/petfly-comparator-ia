const test = require('node:test');
const assert = require('node:assert/strict');
const { getDocumentPolicy } = require('../domain/documentPolicies');

test('Certificación ADI exige las 160 horas y evidencia de lectura', () => {
  const policy = getDocumentPolicy('CERTIFICACION_ADI');
  assert.equal(policy.requiresEvidence, true);
  assert.ok(policy.requiredChecks.includes('TRAINING_160_HOURS'));
});

test('un tipo desconocido utiliza una política genérica segura', () => {
  const policy = getDocumentPolicy('DESCONOCIDO');
  assert.equal(policy.documentType, 'GENERIC');
  assert.deepEqual(policy.requiredChecks, []);
});
