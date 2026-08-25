const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCertificateNumber, extractCertificateNumbers, compareCertificateReferences } = require('../domain/certificateReference');

test('normaliza etiquetas y separadores sin alterar el valor', () => {
  assert.equal(normalizeCertificateNumber('AST-2026-8812'), 'AST20268812');
  assert.deepEqual(extractCertificateNumbers('Certificate No: AST-2026-8812'), ['AST-2026-8812']);
});

test('compara ADI, Certificación ADI y página QR', () => {
  assert.equal(compareCertificateReferences({
    adiNumber: 'AST-2026-8812', certificationNumber: 'AST 2026 8812',
    qrPageNumber: 'AST20268812', qrStatus: 'MATCH',
  }).status, 'MATCH');
  assert.equal(compareCertificateReferences({
    adiNumber: 'AST-2026-8812', certificationNumber: 'AST-2026-9999',
    qrPageNumber: 'AST-2026-8812', qrStatus: 'MATCH',
  }).status, 'MISMATCH');
});

test('queda pendiente si falta la contraparte y no inventa un fallo', () => {
  const result = compareCertificateReferences({ adiNumber: '', certificationNumber: 'AST-2026-8812' });
  assert.equal(result.status, 'PENDING');
  assert.equal(result.isMatch, null);
});

test('distingue QR discrepante de QR ilegible', () => {
  assert.equal(compareCertificateReferences({
    adiNumber: 'AST-2026-8812', certificationNumber: 'AST-2026-8812',
    qrPageNumber: 'AST-2026-9999', qrStatus: 'MISMATCH',
  }).status, 'MISMATCH');
  assert.equal(compareCertificateReferences({
    adiNumber: 'AST-2026-8812', certificationNumber: 'AST-2026-8812',
    qrPageNumber: '', qrStatus: 'UNREADABLE',
  }).status, 'UNREADABLE');
});
