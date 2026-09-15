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

test('Informe Entrenamiento exige consistencia interna del diagnóstico', () => {
  const policy = getDocumentPolicy('INFORME_ENTRENAMIENTO');
  assert.ok(policy.requiredChecks.includes('DIAGNOSIS_INTERNAL_CONSISTENCY'));
});
test('ADI y Certificación ADI conservan sus reglas y exigen número de certificado', () => {
  const adi = getDocumentPolicy('ADI');
  const certification = getDocumentPolicy('CERTIFICACION_ADI');
  for (const previous of ['OWNER_IDENTITY', 'DOG_NAME', 'DOG_BREED', 'ISSUE_DATE', 'PHONE_COUNTRY', 'GRAMMAR']) {
    assert.ok(adi.requiredChecks.includes(previous));
  }
  assert.ok(adi.requiredChecks.includes('CERTIFICATE_NUMBER_INTERNAL_CONSISTENCY'));
  assert.ok(adi.requiredChecks.includes('QR_CERTIFICATE_NUMBER'));
  assert.ok(certification.requiredChecks.includes('TRAINING_160_HOURS'));
  assert.ok(certification.requiredChecks.includes('CERTIFICATE_NUMBER_INTERNAL_CONSISTENCY'));
});
test('REVISION conserva fechas y exige consistencia del código de registro', () => {
  const revision = getDocumentPolicy('REVISION');
  assert.ok(revision.requiredChecks.includes('CERTIFICATION_DATE'));
  assert.ok(revision.requiredChecks.includes('EXPIRY_DATE'));
  assert.ok(revision.requiredChecks.includes('CERTIFICATE_NUMBER_INTERNAL_CONSISTENCY'));
});

test('Medical History Translate conserva sus reglas y exige medidas humanas', () => {
  const policy = getDocumentPolicy('MEDICAL_HISTORY_TRANSLATE');
  for (const check of ['OWNER_NAME', 'OWNER_ID', 'DATE', 'ENGLISH_GRAMMAR']) {
    assert.ok(policy.requiredChecks.includes(check));
  }
  assert.ok(policy.requiredChecks.includes('PATIENT_WEIGHT_CONSISTENCY'));
  assert.ok(policy.requiredChecks.includes('PATIENT_HEIGHT_CONSISTENCY'));
});
