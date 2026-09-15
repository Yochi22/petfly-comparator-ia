const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWeightKg, normalizeHeightCm, buildPatientMeasurementFinding } = require('../domain/patientMeasurements');

const occurrence = (value, location) => ({ label: 'Vital signs', value, location });

test('normaliza unidades equivalentes de peso y estatura', () => {
  assert.ok(Math.abs(normalizeWeightKg('187.4 lb') - 85) < 0.1);
  assert.equal(normalizeHeightCm('1.80 m'), 180);
  assert.equal(normalizeHeightCm('180 cm'), 180);
  assert.ok(Math.abs(normalizeHeightCm(`5' 11\u0022`) - 180.34) < 0.01);
});

test('acepta todas las apariciones cuando coinciden con el Sheet', () => {
  const weight = buildPatientMeasurementFinding({
    kind: 'weight', expected: '85 kg',
    occurrences: [occurrence('85 kg', 'página 1'), occurrence('187.4 lb', 'página 3')],
  });
  const height = buildPatientMeasurementFinding({
    kind: 'height', expected: '1.80 m',
    occurrences: [occurrence('1.80 m', 'página 1'), occurrence('180 cm', 'página 4')],
  });
  assert.equal(weight.finding.status, 'MATCH');
  assert.equal(height.finding.status, 'MATCH');
});

test('una sola aparición distinta produce MISMATCH crítico', () => {
  const result = buildPatientMeasurementFinding({
    kind: 'weight', expected: '85 kg',
    occurrences: [occurrence('85 kg', 'página 1'), occurrence('82 kg', 'página 5')],
  });
  assert.equal(result.finding.status, 'MISMATCH');
  assert.equal(result.finding.severity, 'CRITICAL');
  assert.match(result.finding.found, /página 5/);
});

test('la ausencia o un valor ilegible produce UNREADABLE crítico', () => {
  const result = buildPatientMeasurementFinding({ kind: 'height', expected: '1.80 m', occurrences: [] });
  assert.equal(result.finding.status, 'UNREADABLE');
  assert.equal(result.finding.severity, 'CRITICAL');
});
