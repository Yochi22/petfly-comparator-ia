const fs = require('node:fs/promises');
const path = require('node:path');
const { optimizePdfBuffer } = require('../infrastructure/pdfOptimizer');

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Uso: node scripts/optimizePdf.js <entrada.pdf> <salida.pdf>');
  const source = await fs.readFile(input);
  const optimized = await optimizePdfBuffer(source);
  await fs.writeFile(output, optimized);
  console.log(JSON.stringify({
    input: path.basename(input),
    output: path.basename(output),
    originalBytes: source.length,
    optimizedBytes: optimized.length,
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
