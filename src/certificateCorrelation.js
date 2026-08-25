const TARGET_DOCUMENTS = ['ADI', 'CERTIFICACION_ADI', 'REVISION'];

const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const occurrenceValues = result => {
  const occurrences = result?.document_reference?.certificate_occurrences;
  const values = Array.isArray(occurrences)
    ? occurrences.map(item => typeof item === 'string' ? item : item?.value).filter(Boolean)
    : [];
  if (!values.length && result?.document_reference?.certificate_number) values.push(result.document_reference.certificate_number);
  return [...new Set(values.map(normalize).filter(Boolean))];
};

export function correlateCertificateResults(results) {
  const documents = Object.fromEntries(TARGET_DOCUMENTS.map(type => [type, results.find(result => result.document_type === type && !result.error)]));
  const missingDocuments = TARGET_DOCUMENTS.filter(type => !documents[type]);
  const values = {
    adi: documents.ADI ? occurrenceValues(documents.ADI) : undefined,
    certificationAdi: documents.CERTIFICACION_ADI ? occurrenceValues(documents.CERTIFICACION_ADI) : undefined,
    revision: documents.REVISION ? occurrenceValues(documents.REVISION) : undefined,
  };
  const adiQrFinding = documents.ADI?.findings?.find(item => item.code === 'QR_CERTIFICATE_NUMBER');
  values.qrPage = normalize(documents.ADI?.certificate_correlation?.values?.qrPage || adiQrFinding?.found);

  if (missingDocuments.length) return {
    status: 'PENDING', isMatch: null, values, missingDocuments,
    message: `Validación cruzada pendiente: faltan ${missingDocuments.join(', ')}.`,
  };
  const unreadableDocuments = Object.entries(values)
    .filter(([key, found]) => key !== 'qrPage' && Array.isArray(found) && found.length === 0)
    .map(([key]) => key);
  if (unreadableDocuments.length) return {
    status: 'UNREADABLE', isMatch: false, values, unreadableDocuments,
    message: `No se pudo extraer el número en: ${unreadableDocuments.join(', ')}.`,
  };
  const distinct = [...new Set([values.adi, values.certificationAdi, values.revision].flat())];
  if (distinct.length !== 1) return {
    status: 'MISMATCH', isMatch: false, values,
    message: 'Existe más de un número de certificado/registro entre ADI, Certificación ADI y REVISION.',
  };
  if (adiQrFinding?.status === 'MISMATCH' || (values.qrPage && values.qrPage !== distinct[0])) return {
    status: 'MISMATCH', isMatch: false, values,
    message: 'El número de la página del QR no coincide con los tres documentos.',
  };
  if (adiQrFinding?.status === 'UNREADABLE') return {
    status: 'UNREADABLE', isMatch: false, values,
    message: 'Los tres documentos coinciden, pero no fue posible confirmar la página del QR.',
  };
  return {
    status: 'MATCH', isMatch: true, values,
    message: 'El número coincide en todas las ocurrencias de ADI, Certificación ADI y REVISION, y en la página del QR.',
  };
}

function applyCorrelation(result, correlation) {
  if (!TARGET_DOCUMENTS.includes(result.document_type)) return result;
  const status = correlation.status === 'PENDING' ? 'NOT_PRESENT' : correlation.status;
  const finding = {
    code: 'CERTIFICATE_NUMBER_CROSS_DOCUMENT', category: 'CERTIFICATE',
    severity: correlation.status === 'PENDING' ? 'INFO' : 'CRITICAL', status,
    expected: 'Un único número en ADI, Certificación ADI, REVISION y página del QR',
    found: JSON.stringify(correlation.values), message: correlation.message,
  };
  const previousFindings = result.findings || [];
  const previousCrossFailure = previousFindings.some(item => item.code === finding.code && ['MISMATCH', 'UNREADABLE'].includes(item.status));
  const findings = [...previousFindings.filter(item => item.code !== finding.code), finding];
  const isFailure = ['MISMATCH', 'UNREADABLE'].includes(status);
  const scoreBeforeCross = previousCrossFailure ? Math.min(100, (result.score ?? 0) + 35) : (result.score ?? 100);
  const score = isFailure ? Math.max(0, scoreBeforeCross - 35) : scoreBeforeCross;
  const hasOtherCriticalFailure = findings.some(item => item.code !== finding.code && item.severity === 'CRITICAL' && ['MISMATCH', 'UNREADABLE'].includes(item.status));
  const finalVerdict = correlation.status === 'PENDING' ? result.final_verdict
    : `${correlation.status === 'MATCH' ? 'Validación cruzada superada.' : 'Validación cruzada crítica fallida.'} ${correlation.message}`;
  return {
    ...result, is_valid: !isFailure && !hasOtherCriticalFailure && score >= 70, score,
    final_verdict: finalVerdict, findings,
    scoring: result.scoring ? { ...result.scoring, penalties: Math.max(0, result.scoring.penalties + (isFailure ? 35 : 0) - (previousCrossFailure ? 35 : 0)) } : result.scoring,
    certificate_correlation: correlation,
  };
}

export function reconcileAuditResults(results) {
  const auditIds = [...new Set(results.map(result => result.audit_id).filter(Boolean))];
  let reconciled = [...results];
  for (const auditId of auditIds) {
    const correlation = correlateCertificateResults(reconciled.filter(result => result.audit_id === auditId));
    reconciled = reconciled.map(result => result.audit_id === auditId ? applyCorrelation(result, correlation) : result);
  }
  return reconciled;
}
