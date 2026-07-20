const COMMON = Object.freeze({
  requiresEvidence: true,
  absentFieldsAreErrors: false,
  ignoreDogGenderLanguage: true,
  futureDatesAllowed: true,
});

const POLICIES = Object.freeze({
  VERI_MEDIC: { requiredChecks: ['OWNER_IDENTITY', 'EXPEDITION_MONTH', 'GRAMMAR'] },
  CARNET: { requiredChecks: ['OWNER_NAME', 'PHONE', 'DOG_NAME', 'DOG_BREED', 'ISSUE_DATE', 'EXPIRY_DATE'] },
  CARNET_ADI: { requiredChecks: ['OWNER_NAME', 'PHONE', 'DOG_NAME', 'MICROCHIP', 'ISSUE_DATE', 'EXPIRY_DATE'] },
  REVISION: { requiredChecks: ['CERTIFICATION_DATE', 'EXPIRY_DATE'] },
  INFORME_ENTRENAMIENTO: { requiredChecks: ['OWNER_IDENTITY', 'DOG_DATA', 'DOG_NAME_CONSISTENCY', 'DATES', 'GRAMMAR'] },
  ADI: { requiredChecks: ['OWNER_IDENTITY', 'DOG_NAME', 'DOG_BREED', 'ISSUE_DATE', 'PHONE_COUNTRY', 'GRAMMAR'] },
  K9: { requiredChecks: ['OWNER_IDENTITY', 'DOG_NAME', 'DOG_BREED', 'GRAMMAR'] },
  CERTIFICACION_ADI: { requiredChecks: ['OWNER_NAME', 'DOG_NAME', 'DOG_BREED', 'ISSUE_DATE', 'TRAINING_160_HOURS', 'GRAMMAR'] },
  MEDICAL_HISTORY_TRANSLATE: { requiredChecks: ['OWNER_NAME', 'OWNER_ID', 'DATE', 'ENGLISH_GRAMMAR'] },
  GENERIC: { requiredChecks: [], requiresEvidence: false },
});

function getDocumentPolicy(documentType) {
  const specific = POLICIES[documentType] || POLICIES.GENERIC;
  return Object.freeze({
    ...COMMON,
    ...specific,
    documentType: POLICIES[documentType] ? documentType : 'GENERIC',
  });
}

module.exports = { POLICIES, getDocumentPolicy };
