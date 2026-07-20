const DOCUMENT_TYPES = Object.freeze({
  VERI_MEDIC: 'VERI_MEDIC',
  CARNET_ADI: 'CARNET_ADI',
  CARNET: 'CARNET',
  REVISION: 'REVISION',
  INFORME_ENTRENAMIENTO: 'INFORME_ENTRENAMIENTO',
  CERTIFICACION_ADI: 'CERTIFICACION_ADI',
  ADI: 'ADI',
  K9: 'K9',
  MEDICAL_HISTORY_TRANSLATE: 'MEDICAL_HISTORY_TRANSLATE',
  GENERIC: 'GENERIC',
});

function normalizeFilename(filename) {
  return (filename || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDocType(filename) {
  const name = normalizeFilename(filename);
  if (/^veri\s*medic/.test(name)) return DOCUMENT_TYPES.VERI_MEDIC;
  if (name.startsWith('carnet adi')) return DOCUMENT_TYPES.CARNET_ADI;
  if (name.startsWith('carnet')) return DOCUMENT_TYPES.CARNET;
  if (name.startsWith('revision')) return DOCUMENT_TYPES.REVISION;
  if (name.startsWith('informe entrenamiento')) return DOCUMENT_TYPES.INFORME_ENTRENAMIENTO;
  if (/^(certificacion|certificado|certificate)\s+(de\s+)?adi\b/.test(name)) return DOCUMENT_TYPES.CERTIFICACION_ADI;
  if (name.startsWith('adi')) return DOCUMENT_TYPES.ADI;
  if (name.startsWith('k9')) return DOCUMENT_TYPES.K9;
  if (name.startsWith('medical history translate')) return DOCUMENT_TYPES.MEDICAL_HISTORY_TRANSLATE;
  return DOCUMENT_TYPES.GENERIC;
}

module.exports = { DOCUMENT_TYPES, detectDocType, normalizeFilename };
