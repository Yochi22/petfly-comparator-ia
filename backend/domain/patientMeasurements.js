function parseNumber(value) {
  const match = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizeWeightKg(value) {
  const text = String(value || '').toLowerCase().trim();
  const amount = parseNumber(text);
  if (!Number.isFinite(amount)) return null;
  if (/\b(lb|lbs|pound|pounds)\b/.test(text)) return amount * 0.45359237;
  return amount;
}

function normalizeHeightCm(value) {
  const text = String(value || '').toLowerCase().trim();
  const feet = text.match(/(\d+)\s*(?:ft|feet|')\s*(\d+(?:\.\d+)?)?\s*(?:in|inches|\u0022)?/);
  if (feet) return (Number(feet[1]) * 12 + Number(feet[2] || 0)) * 2.54;
  const amount = parseNumber(text);
  if (!Number.isFinite(amount)) return null;
  if (/\b(mm|millimeter|millimeters)\b/.test(text)) return amount / 10;
  if (/\b(cm|centimeter|centimeters)\b/.test(text)) return amount;
  if (/\b(in|inch|inches)\b/.test(text)) return amount * 2.54;
  if (/\b(m|meter|meters|metre|metres)\b/.test(text)) return amount * 100;
  return amount <= 3 ? amount * 100 : amount;
}

function normalizeOccurrences(occurrences) {
  return (Array.isArray(occurrences) ? occurrences : [])
    .map(item => typeof item === 'string'
      ? { label: '', value: item, location: '' }
      : { label: String(item?.label || ''), value: String(item?.value || ''), location: String(item?.location || '') })
    .filter(item => item.value);
}

function buildPatientMeasurementFinding({ kind, occurrences, expected }) {
  const isWeight = kind === 'weight';
  const code = isWeight ? 'PATIENT_WEIGHT_CONSISTENCY' : 'PATIENT_HEIGHT_CONSISTENCY';
  const label = isWeight ? 'peso' : 'estatura';
  const unit = isWeight ? 'kg' : 'cm';
  const tolerance = isWeight ? 0.1 : 0.5;
  const parse = isWeight ? normalizeWeightKg : normalizeHeightCm;
  const normalizedOccurrences = normalizeOccurrences(occurrences);
  const expectedValue = parse(expected);
  const parsed = normalizedOccurrences.map(item => ({ ...item, normalized: parse(item.value) }));
  let status = 'MATCH';
  let message = `Todas las apariciones del ${label} humano coinciden entre sí y con el Sheet.`;
  if (!Number.isFinite(expectedValue)) {
    status = 'UNREADABLE';
    message = `No se pudo interpretar el ${label} esperado del Sheet: ${expected || ''}.`;
  } else if (!parsed.length || parsed.some(item => !Number.isFinite(item.normalized))) {
    status = 'UNREADABLE';
    message = `No se pudieron leer y normalizar todas las apariciones del ${label} humano.`;
  } else if (parsed.some(item => Math.abs(item.normalized - expectedValue) > tolerance)) {
    status = 'MISMATCH';
    message = `Al menos una aparición del ${label} humano no coincide con el Sheet o con el resto del documento.`;
  }
  return {
    occurrences: normalizedOccurrences,
    finding: {
      code,
      category: 'PATIENT_MEASUREMENTS',
      severity: status === 'MATCH' ? 'INFO' : 'CRITICAL',
      status,
      expected: `${expected} (${expectedValue ?? 'no interpretable'} ${unit})`,
      found: parsed.map(item => `${item.label || label}: ${item.value} (${item.location || 'ubicación no informada'})`).join(' | '),
      message,
    },
  };
}

module.exports = { normalizeWeightKg, normalizeHeightCm, buildPatientMeasurementFinding };
