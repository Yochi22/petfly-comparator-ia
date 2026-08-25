const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCertificateNumber, extractCertificateNumbers,
  buildInternalConsistencyFinding, compareCertificateReferences,
} = require('../domain/certificateReference');

const occurrence = (value, location) => ({ label: 'Certificate Number', value, location });

test('normaliza etiquetas y separadores sin alterar el valor', () => {
  assert.equal(normalizeCertificateNumber('AST-2026-8812'), 'AST20268812');
  assert.deepEqual(extractCertificateNumbers('Certificate No: AST-2026-8812'), ['AST-2026-8812']);
});

test('solo declara MATCH cuando están los tres documentos y todas sus ocurrencias coinciden', () => {
  const result = compareCertificateReferences({
    adiOccurrences: [occurrence('AST-2026-8812', 'encabezado'), occurrence('AST 2026 8812', 'pie')],
    certificationOccurrences: [occurrence('AST-2026-8812', 'página 1')],
    revisionOccurrences: [occurrence('AST20268812', 'captura QR')],
    qrPageNumber: 'AST-2026-8812', qrStatus: 'MATCH',
  });
  assert.equal(result.status, 'MATCH');
});

test('queda pendiente hasta recibir ADI, Certificación ADI y REVISION', () => {
  const result = compareCertificateReferences({
    adiOccurrences: [occurrence('AST-2026-8812', 'encabezado')],
    certificationOccurrences: [occurrence('AST-2026-8812', 'página 1')],
  });
  assert.equal(result.status, 'PENDING');
  assert.deepEqual(result.missingDocuments, ['revision']);
});

test('una sola ocurrencia distinta produce MISMATCH crítico determinista', () => {
  const internal = buildInternalConsistencyFinding([
    occurrence('AST-2026-8812', 'encabezado'),
    occurrence('ADI-SD-2026-48107', 'página 2'),
    occurrence('AST-2026-8812', 'pie'),
  ]);
  assert.equal(internal.finding.status, 'MISMATCH');
  assert.equal(internal.finding.severity, 'CRITICAL');
  assert.match(internal.finding.found, /página 2/);
});

test('detecta diferencias entre cualquiera de los tres documentos', () => {
  const result = compareCertificateReferences({
    adiOccurrences: [occurrence('AST-2026-8812', 'ADI')],
    certificationOccurrences: [occurrence('AST-2026-8812', 'Certificación')],
    revisionOccurrences: [occurrence('AST-2026-2020', 'REVISION')],
    qrPageNumber: 'AST-2026-2020', qrStatus: 'MATCH',
  });
  assert.equal(result.status, 'MISMATCH');
});
