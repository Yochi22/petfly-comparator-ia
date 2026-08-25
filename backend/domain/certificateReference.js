const REFERENCE_PATTERN = /\b[A-Z]{2,12}[\s-]*\d{4}[\s-]*\d{3,12}\b/gi;

function normalizeCertificateNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractCertificateNumbers(text) {
  const matches = String(text || '').match(REFERENCE_PATTERN) || [];
  return [...new Set(matches.map(value => value.trim()))];
}

function compareCertificateReferences({ adiNumber, certificationNumber, qrPageNumber, qrStatus }) {
  const values = {
    adi: normalizeCertificateNumber(adiNumber),
    certificationAdi: normalizeCertificateNumber(certificationNumber),
    qrPage: normalizeCertificateNumber(qrPageNumber),
  };
  if (!values.adi || !values.certificationAdi) {
    return { status: 'PENDING', isMatch: null, values, message: `Validación cruzada pendiente: falta ${!values.adi ? 'ADI' : 'Certificación ADI'}.` };
  }
  if (qrStatus !== 'MATCH' || !values.qrPage) {
    const status = qrStatus === 'MISMATCH' ? 'MISMATCH' : 'UNREADABLE';
    return { status, isMatch: false, values, message: status === 'MISMATCH'
      ? 'El número publicado en la página del QR no coincide con ADI.'
      : 'No fue posible confirmar el número publicado en la página del QR.' };
  }
  const isMatch = Object.values(values).every(value => value === values.adi);
  return {
    status: isMatch ? 'MATCH' : 'MISMATCH',
    isMatch,
    values,
    message: isMatch
      ? 'El número coincide en ADI, Certificación ADI y la página del QR.'
      : 'El número no coincide entre ADI, Certificación ADI y la página del QR.',
  };
}

module.exports = { normalizeCertificateNumber, extractCertificateNumbers, compareCertificateReferences };
