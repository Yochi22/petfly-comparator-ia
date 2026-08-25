const REFERENCE_PATTERN = /\b[A-Z]{2,12}[\s-]*\d{4}[\s-]*\d{3,12}\b/gi;

function normalizeCertificateNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractCertificateNumbers(text) {
  const matches = String(text || '').match(REFERENCE_PATTERN) || [];
  return [...new Set(matches.map(value => value.trim()))];
}

function compareCertificateReferences({ adiNumber, certificationNumber, revisionNumber, qrPageNumber, qrStatus }) {
  const values = {
    adi: normalizeCertificateNumber(adiNumber),
    certificationAdi: normalizeCertificateNumber(certificationNumber),
    revision: normalizeCertificateNumber(revisionNumber),
    qrPage: normalizeCertificateNumber(qrPageNumber),
  };
  const present = Object.entries(values).filter(([, v]) => v);
  if (present.length < 2) {
    const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
    return { status: 'PENDING', isMatch: null, values, message: `Validación cruzada pendiente: faltan documentos (${missing.join(', ')}).` };
  }
  if (qrStatus !== 'MATCH' || !values.qrPage) {
    const status = qrStatus === 'MISMATCH' ? 'MISMATCH' : 'UNREADABLE';
    return { status, isMatch: false, values, message: status === 'MISMATCH'
      ? 'El número publicado en la página del QR no coincide con ADI.'
      : 'No fue posible confirmar el número publicado en la página del QR.' };
  }
  const nonEmptyValues = present.map(([, v]) => v);
  const isMatch = nonEmptyValues.every(v => v === nonEmptyValues[0]);
  return {
    status: isMatch ? 'MATCH' : 'MISMATCH',
    isMatch,
    values,
    message: isMatch
      ? 'El número coincide en todos los documentos presentados (ADI, Certificación ADI, Revisión y página del QR).'
      : 'El número NO coincide entre todos los documentos. Verifica ADI, Certificación ADI, Revisión y la página del QR.',
  };
}

module.exports = { normalizeCertificateNumber, extractCertificateNumbers, compareCertificateReferences };
