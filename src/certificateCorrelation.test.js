import test from 'node:test';
import assert from 'node:assert/strict';
import { correlateCertificateResults, reconcileAuditResults } from './certificateCorrelation.js';

const result = (document_type, values, extra = {}) => ({
  audit_id: 'audit-row-69-test', document_type, score: 100, is_valid: true,
  findings: [], scoring: { penalties: 0 },
  document_reference: {
    certificate_number: values[0],
    certificate_occurrences: values.map((value, index) => ({ label: 'Certificate Number', value, location: `página ${index + 1}` })),
  },
  ...extra,
});

test('no finaliza la correlación mientras falte uno de los tres documentos', () => {
  const correlation = correlateCertificateResults([
    result('ADI', ['AST-2026-8812']),
    result('CERTIFICACION_ADI', ['AST-2026-8812']),
  ]);
  assert.equal(correlation.status, 'PENDING');
  assert.deepEqual(correlation.missingDocuments, ['REVISION']);
});

test('un resultado pendiente no puede mostrarse válido ni con 100 puntos', () => {
  const reconciled = reconcileAuditResults([
    result('REVISION', ['AST-2026-2020'], { clientKey: 'row-69' }),
  ]);
  const crossFinding = reconciled[0].findings.find(finding => finding.code === 'CERTIFICATE_NUMBER_CROSS_DOCUMENT');
  assert.equal(crossFinding.status, 'UNREADABLE');
  assert.equal(crossFinding.severity, 'CRITICAL');
  assert.equal(reconciled[0].is_valid, false);
  assert.equal(reconciled[0].score, 65);
  assert.match(reconciled[0].final_verdict, /incompleta/i);
});

test('correlaciona cargas separadas del mismo cliente aunque tengan auditId distintos', () => {
  const documents = [
    { ...result('ADI', ['AST-2026-8812']), audit_id: 'audit-one', clientKey: 'row-69' },
    { ...result('CERTIFICACION_ADI', ['AST-2026-8812']), audit_id: 'audit-two', clientKey: 'row-69' },
    { ...result('REVISION', ['AST-2026-2020']), audit_id: 'audit-three', clientKey: 'row-69' },
  ];
  const reconciled = reconcileAuditResults(documents);
  assert.ok(reconciled.every(document => document.certificate_correlation.status === 'MISMATCH'));
  assert.ok(reconciled.every(document => document.is_valid === false));
});

test('sobrescribe el estado pendiente de los tres resultados con el mismatch final', () => {
  const pendingFinding = {
    code: 'CERTIFICATE_NUMBER_CROSS_DOCUMENT', severity: 'INFO', status: 'NOT_PRESENT',
    message: 'Validación cruzada pendiente.',
  };
  const reconciled = reconcileAuditResults([
    result('ADI', ['AST-2026-8812'], {
      findings: [pendingFinding, { code: 'QR_CERTIFICATE_NUMBER', severity: 'CRITICAL', status: 'MISMATCH', found: 'AST-2026-2020' }],
    }),
    result('CERTIFICACION_ADI', ['AST-2026-8812', 'ADI-SD-2026-48107'], { findings: [pendingFinding] }),
    result('REVISION', ['AST-2026-2020'], { findings: [pendingFinding] }),
  ]);

  for (const document of reconciled) {
    const crossFinding = document.findings.find(finding => finding.code === 'CERTIFICATE_NUMBER_CROSS_DOCUMENT');
    assert.equal(crossFinding.status, 'MISMATCH');
    assert.equal(crossFinding.severity, 'CRITICAL');
    assert.equal(document.is_valid, false);
    assert.match(document.final_verdict, /crítica fallida/i);
  }
});
