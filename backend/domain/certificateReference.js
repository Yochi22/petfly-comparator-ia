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

  const presentEntries = Object.entries(values).filter(([, v]) => v);
  const presentValues = presentEntries.map(([, v]) => v);

  if (presentEntries.length < 2) {
    const missing = Object.keys(values).filter(k => !values[k]);
    return {
      status: 'PENDING',
      isMatch: null,
      values,
      message: `Validación cruzada pendiente: se requiere al menos dos documentos/fuentes para comparar (faltan: ${missing.join(', ')}).`
    };
  }

  const allMatch = presentValues.every(v => v === presentValues[0]);

  if (!allMatch) {
    const diffs = [];
    if (values.adi && values.certificationAdi && values.adi !== values.certificationAdi) {
      diffs.push(`ADI (${adiNumber}) vs Certificación ADI (${certificationNumber})`);
    }
    if (values.adi && values.revision && values.adi !== values.revision) {
      diffs.push(`ADI (${adiNumber}) vs Revisión (${revisionNumber})`);
    }
    if (values.certificationAdi && values.revision && values.certificationAdi !== values.revision) {
      diffs.push(`Certificación ADI (${certificationNumber}) vs Revisión (${revisionNumber})`);
    }
    if (values.qrPage && values.adi && values.qrPage !== values.adi) {
      diffs.push(`Página del QR (${qrPageNumber}) vs ADI (${adiNumber})`);
    }
    
    return {
      status: 'MISMATCH',
      isMatch: false,
      values,
      message: `El número de certificado NO coincide: ${diffs.join(', ')}.`
    };
  }

  if (qrStatus === 'MISMATCH') {
    return {
      status: 'MISMATCH',
      isMatch: false,
      values,
      message: 'El número publicado en la página del QR no coincide con el número visible en ADI.'
    };
  }

  if (qrStatus === 'UNREADABLE') {
    return {
      status: 'UNREADABLE',
      isMatch: false,
      values,
      message: 'No fue posible confirmar el número publicado en la página del QR.'
    };
  }

  return {
    status: 'MATCH',
    isMatch: true,
    values,
    message: 'El número coincide en todos los documentos y fuentes comparadas hasta el momento.'
  };
}

module.exports = { normalizeCertificateNumber, extractCertificateNumbers, compareCertificateReferences };
