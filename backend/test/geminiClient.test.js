const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAuditResult } = require('../infrastructure/geminiClient');

test('normaliza score y campos opcionales de Gemini', () => {
  const result = normalizeAuditResult({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      is_valid: true,
      score: 120,
      final_verdict: 'Correcto',
      analysis: {
        human_match: 'Coincide',
        dog_match: 'Coincide',
        date_validation: 'Coincide',
        spelling_and_grammar_notes: 'Sin errores detectados',
      },
    }) }] } }],
  });

  assert.equal(result.score, 100);
  assert.deepEqual(result.analysis.extracted_evidence, []);
});

test('rechaza respuestas vacías o ajenas al contrato', () => {
  assert.throws(() => normalizeAuditResult({ candidates: [] }), /no devolvió contenido/i);
  assert.throws(
    () => normalizeAuditResult({ candidates: [{ content: { parts: [{ text: 'no json' }] } }] }),
    /contrato JSON/i,
  );
});
