const PENALTIES = Object.freeze({ CRITICAL: 35, MAJOR: 15, MINOR: 5, INFO: 0 });
const VALID_SEVERITIES = new Set(Object.keys(PENALTIES));
const VALID_STATUSES = new Set(['MATCH', 'MISMATCH', 'UNREADABLE', 'NOT_PRESENT']);
const CRITICAL_CHECKS = new Set([
  'OWNER_IDENTITY', 'OWNER_ID', 'MICROCHIP', 'ISSUE_DATE', 'EXPIRY_DATE',
  'CERTIFICATION_DATE', 'EXPEDITION_MONTH', 'TRAINING_160_HOURS',
]);

function normalizeFinding(finding, index) {
  const severity = VALID_SEVERITIES.has(finding?.severity) ? finding.severity : 'MAJOR';
  const status = VALID_STATUSES.has(finding?.status) ? finding.status : 'UNREADABLE';
  return {
    code: String(finding?.code || `FINDING_${index + 1}`).toUpperCase(),
    category: String(finding?.category || 'OTHER'),
    severity,
    status,
    expected: String(finding?.expected || ''),
    found: String(finding?.found || ''),
    message: String(finding?.message || ''),
  };
}

const CHECK_ALIASES = Object.freeze({
  OWNER_IDENTITY: ['OWNER_IDENTITY', 'OWNER_NAME', 'OWNER_ID', 'HUMAN_MATCH'],
  DOG_DATA: ['DOG_DATA', 'DOG_NAME', 'DOG_BREED', 'DOG_AGE', 'MICROCHIP'],
  DOG_NAME_CONSISTENCY: ['DOG_NAME_CONSISTENCY', 'DOG_NAME'],
  DATES: ['DATES', 'DATE', 'ISSUE_DATE', 'EXPIRY_DATE', 'CERTIFICATION_DATE'],
  GRAMMAR: ['GRAMMAR', 'SPELLING', 'REDACTION'],
  ENGLISH_GRAMMAR: ['ENGLISH_GRAMMAR', 'GRAMMAR', 'SPELLING', 'REDACTION'],
});

function findingSatisfiesCheck(finding, requiredCheck) {
  const aliases = CHECK_ALIASES[requiredCheck] || [requiredCheck];
  return aliases.some(alias => finding.code === alias || finding.code.includes(alias));
}

function applyScoringPolicy(aiResult, { documentPolicy }) {
  const findings = Array.isArray(aiResult.findings)
    ? aiResult.findings.map(normalizeFinding)
    : [];

  for (const requiredCheck of documentPolicy.requiredChecks) {
    if (findings.some(finding => findingSatisfiesCheck(finding, requiredCheck))) continue;
    findings.push({
      code: requiredCheck,
      category: 'REQUIRED_CHECK',
      severity: requiredCheck.includes('GRAMMAR') ? 'MINOR' : CRITICAL_CHECKS.has(requiredCheck) ? 'CRITICAL' : 'MAJOR',
      status: 'UNREADABLE',
      expected: 'Verificación obligatoria según la política documental',
      found: 'Gemini no entregó el hallazgo requerido',
      message: `No se recibió el resultado obligatorio ${requiredCheck}.`,
    });
  }

  if (documentPolicy.requiresEvidence && aiResult.analysis.extracted_evidence.length === 0) {
    findings.push({
      code: 'DOCUMENT_NOT_READ',
      category: 'READABILITY',
      severity: 'CRITICAL',
      status: 'UNREADABLE',
      expected: 'Evidencia concreta extraída de todas las páginas',
      found: 'Sin evidencia extraída',
      message: `No se pudo demostrar la lectura del documento ${documentPolicy.documentType}.`,
    });
  }

  const actionable = findings.filter(finding => ['MISMATCH', 'UNREADABLE'].includes(finding.status));
  const score = Math.max(0, 100 - actionable.reduce((total, finding) => total + PENALTIES[finding.severity], 0));
  const hasCriticalFailure = actionable.some(finding => finding.severity === 'CRITICAL');
  const isValid = !hasCriticalFailure && score >= 70;

  return {
    ...aiResult,
    is_valid: isValid,
    score,
    findings,
    scoring: {
      policy_version: '1.0.0',
      ai_score: aiResult.score,
      ai_is_valid: aiResult.is_valid,
      penalties: actionable.reduce((total, finding) => total + PENALTIES[finding.severity], 0),
    },
  };
}

module.exports = { PENALTIES, applyScoringPolicy, findingSatisfiesCheck };
