const REFERENCE_PATTERN = /\b[A-Z]{2,12}[\s-]*\d{4}[\s-]*\d{3,12}\b/gi;

function normalizeCertificateNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function extractCertificateNumbers(text) {
  const matches = String(text || '').match(REFERENCE_PATTERN) || [];
  return [...new Set(matches.map(value => value.trim()))];
}

function occurrenceValues(occurrences, fallback) {
  const values = (Array.isArray(occurrences) ? occurrences : [])
    .map(item => typeof item === 'string' ? item : item?.value)
    .filter(Boolean);
  if (!values.length && fallback) values.push(fallback);
  return values;
}

function uniqueNormalized(values) {
  return [...new Set(values.map(normalizeCertificateNumber).filter(Boolean))];
}

function buildInternalConsistencyFinding(occurrences, fallbackNumber) {
  const normalizedOccurrences = (Array.isArray(occurrences) ? occurrences : [])
    .map(item => typeof item === 'string'
      ? { label: '', value: item, location: '' }
      : { label: String(item?.label || ''), value: String(item?.value || ''), location: String(item?.location || '') })
    .filter(item => item.value);
  if (!normalizedOccurrences.length && fallbackNumber) {
    normalizedOccurrences.push({ label: 'Número principal', value: fallbackNumber, location: 'Ubicación no informada' });
  }
  const distinct = uniqueNormalized(normalizedOccurrences.map(item => item.value));
  const status = distinct.length === 0 ? 'UNREADABLE' : distinct.length === 1 ? 'MATCH' : 'MISMATCH';
  return {
    occurrences: normalizedOccurrences,
    finding: {
      code: 'CERTIFICATE_NUMBER_INTERNAL_CONSISTENCY',
      category: 'CERTIFICATE',
      severity: status === 'MATCH' ? 'INFO' : 'CRITICAL',
      status,
      expected: 'Un único número en todas las secciones del documento',
      found: normalizedOccurrences.map(item => `${item.label || 'Número'}: ${item.value} (${item.location || 'ubicación no informada'})`).join(' | '),
      message: status === 'MATCH'
        ? `Todas las ${normalizedOccurrences.length} ocurrencia(s) encontradas contienen el mismo número.`
        : status === 'MISMATCH'
          ? 'Se encontraron números distintos dentro del mismo documento.'
          : 'No se pudo extraer ningún número de certificado o registro del documento.',
    },
  };
}
function compareCertificateReferences({
  adiOccurrences, certificationOccurrences, revisionOccurrences,
  adiNumber, certificationNumber, revisionNumber, qrPageNumber, qrStatus,
}) {
  const sources = {
    adi: adiOccurrences === undefined && adiNumber === undefined
      ? undefined : uniqueNormalized(occurrenceValues(adiOccurrences, adiNumber)),
    certificationAdi: certificationOccurrences === undefined && certificationNumber === undefined
      ? undefined : uniqueNormalized(occurrenceValues(certificationOccurrences, certificationNumber)),
    revision: revisionOccurrences === undefined && revisionNumber === undefined
      ? undefined : uniqueNormalized(occurrenceValues(revisionOccurrences, revisionNumber)),
  };
  const missingDocuments = Object.entries(sources).filter(([, values]) => values === undefined).map(([key]) => key);
  const unreadableDocuments = Object.entries(sources).filter(([, values]) => Array.isArray(values) && values.length === 0).map(([key]) => key);
  const values = { ...sources, qrPage: normalizeCertificateNumber(qrPageNumber) };

  if (missingDocuments.length) {
    return {
      status: 'PENDING', isMatch: null, values, missingDocuments,
      message: `Validación cruzada pendiente: faltan ${missingDocuments.join(', ')}.`,
    };
  }
  if (unreadableDocuments.length) {
    return {
      status: 'UNREADABLE', isMatch: false, values, unreadableDocuments,
      message: `No se pudo extraer el número en: ${unreadableDocuments.join(', ')}.`,
    };
  }

  const documentValues = Object.values(sources).flat();
  const distinct = [...new Set(documentValues)];
  if (distinct.length !== 1) {
    return {
      status: 'MISMATCH', isMatch: false, values,
      message: 'Existe más de un número de certificado/registro entre ADI, Certificación ADI y REVISION.',
    };
  }
  if (qrStatus === 'MISMATCH') {
    return {
      status: 'MISMATCH', isMatch: false, values,
      message: 'El número solicitado por la página del QR no coincide con los tres documentos.',
    };
  }
  if (qrStatus === 'UNREADABLE') {
    return {
      status: 'UNREADABLE', isMatch: false, values,
      message: 'Los tres documentos coinciden, pero no fue posible confirmar la página del QR.',
    };
  }
  return {
    status: 'MATCH', isMatch: true, values,
    message: 'El número coincide en todas las ocurrencias de ADI, Certificación ADI y REVISION, y en la página del QR.',
  };
}

module.exports = {
  normalizeCertificateNumber, extractCertificateNumbers, occurrenceValues,
  uniqueNormalized, buildInternalConsistencyFinding, compareCertificateReferences,
};
