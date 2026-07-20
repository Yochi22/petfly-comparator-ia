const test = require('node:test');
const assert = require('node:assert/strict');
const { applyScoringPolicy } = require('../domain/scoringPolicy');
const { getDocumentPolicy } = require('../domain/documentPolicies');

function baseResult(overrides = {}) {
  return {
    is_valid: true,
    score: 99,
    final_verdict: 'Resultado IA',
    analysis: { extracted_evidence: ['Nombre: Ana'] },
    findings: [],
    ...overrides,
  };
}

const noRequiredChecksPolicy = { documentType: 'TEST', requiresEvidence: false, requiredChecks: [] };

test('calcula score desde hallazgos y no desde el número elegido por la IA', () => {
  const result = applyScoringPolicy(baseResult({
    findings: [{ code: 'PHONE', severity: 'MAJOR', status: 'MISMATCH' }],
  }), { documentPolicy: noRequiredChecksPolicy });
  assert.equal(result.score, 85);
  assert.equal(result.scoring.ai_score, 99);
  assert.equal(result.is_valid, true);
});

test('una discrepancia crítica invalida el documento', () => {
  const result = applyScoringPolicy(baseResult({
    findings: [{ code: 'EXPIRY', severity: 'CRITICAL', status: 'MISMATCH' }],
  }), { documentPolicy: noRequiredChecksPolicy });
  assert.equal(result.score, 65);
  assert.equal(result.is_valid, false);
});

test('Certificación ADI sin evidencia queda marcada como ilegible', () => {
  const result = applyScoringPolicy(baseResult({ analysis: { extracted_evidence: [] } }), {
    documentPolicy: getDocumentPolicy('CERTIFICACION_ADI'),
  });
  assert.ok(result.findings.some(finding => finding.code === 'DOCUMENT_NOT_READ'));
  assert.equal(result.is_valid, false);
});

test('agrega hallazgos faltantes exigidos por la política', () => {
  const result = applyScoringPolicy(baseResult(), {
    documentPolicy: getDocumentPolicy('CARNET'),
  });
  assert.ok(result.findings.some(finding => finding.code === 'EXPIRY_DATE' && finding.status === 'UNREADABLE'));
  assert.equal(result.is_valid, false);
});

test('reconoce códigos equivalentes sin crear penalizaciones duplicadas', () => {
  const result = applyScoringPolicy(baseResult({
    findings: [
      { code: 'OWNER_NAME', severity: 'INFO', status: 'MATCH' },
      { code: 'DOG_NAME', severity: 'INFO', status: 'MATCH' },
      { code: 'DOG_BREED', severity: 'INFO', status: 'MATCH' },
      { code: 'GRAMMAR_SPELLING', severity: 'MINOR', status: 'MISMATCH' },
    ],
  }), { documentPolicy: getDocumentPolicy('K9') });

  assert.equal(result.findings.some(finding => finding.code === 'GRAMMAR' && finding.status === 'UNREADABLE'), false);
  assert.equal(result.findings.some(finding => finding.code === 'OWNER_IDENTITY' && finding.status === 'UNREADABLE'), false);
});
