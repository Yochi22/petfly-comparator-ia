const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = 3001;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;


const jwt = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.replace(/"/g, '').trim(),
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/"/g, '').replace(/\\n/g, '\n').replace(/\\r/g, ''),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, jwt);


const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];


function parseExpedition(str) {
  if (!str) return null;
  const p = str.trim().split('/');
  if (p.length !== 3) return null;
  const [d, m, y] = p.map(Number);
  return new Date(y, m - 1, d);
}


function parseYears(validity) {
  if (!validity) return null;
  const match = validity.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}


function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}


function fmtCarnet(date) {
  return `${MONTHS_SHORT[date.getMonth()]}/${String(date.getDate()).padStart(2,'0')}/${date.getFullYear()}`;
}


function fmtSlash(date) {
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
}


function fmtLong(date) {
  return `${MONTHS_FULL[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}


function prevMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() - 1);
  return d;
}


function detectDocType(filename) {
  const lower = (filename || '').toLowerCase();
  if (/^veri\s*medic/.test(lower)) return 'VERI_MEDIC';
  if (lower.startsWith('carnet'))   return 'CARNET';
  return 'GENERIC';
}



async function callGeminiDirect(prompt, buffer, mimeType, retries = 3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mimeType, data: buffer.toString('base64') } }
      ]
    }]
  };

  try {
    const response = await axios.post(url, payload);
    return response.data;
  } catch (error) {
    if ((error.response?.status === 429 || error.response?.status === 503) && retries > 0) {
      
      console.log(`⚠️ Límite de cuota alcanzado. Reintentando en 12s... (${retries} intentos restantes)`);
      await new Promise(resolve => setTimeout(resolve, 12000));
      return callGeminiDirect(prompt, buffer, mimeType, retries - 1);
    }
    throw error;
  }
}

app.get('/api/clients', async (req, res) => {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    res.json(rows.map(row => ({
      phone_number:         row.get('phone_number'),
      client_email:         row.get('client_email'),
      client_name:          row.get('client_name'),
      client_id:            row.get('client_id'),
      address:              row.get('address'),
      travel_date:          row.get('travel_date'),
      client_gender:        row.get('client_gender'),
      dog_gender:           row.get('dog_gender'),
      dog_name:             row.get('dog_name'),
      dog_age:              row.get('dog_age'),
      dog_breed:            row.get('dog_breed'),
      dog_weight:           row.get('dog_weight'),
      certificate_validity: row.get('certificate_validity'),
      expedition:           row.get('expedition') || '',
      microchip_number:     row.get('microchip_number'),
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/validate', upload.single('file'), async (req, res) => {
  try {
    const { expectedData } = req.body;
    const client   = JSON.parse(expectedData);
    const mimeType = req.file.mimetype;
    const filename = req.file.originalname || '';
    const docType  = detectDocType(filename);

    
    const expeditionDate = parseExpedition(client.expedition);
    const validityYears  = parseYears(client.certificate_validity);
    const expiryDate     = (expeditionDate && validityYears) ? addYears(expeditionDate, validityYears) : null;

    // Debug log to verify date calculations
    console.log(`📅 Expedición raw: "${client.expedition}" → parsed: ${expeditionDate}`);
    console.log(`📅 Validez raw: "${client.certificate_validity}" → años: ${validityYears}`);
    console.log(`📅 Vencimiento calculado: ${expiryDate} → ${expiryDate ? fmtCarnet(expiryDate) : 'null'}`);

    
    let dateSection = '';

    if (docType === 'VERI_MEDIC' && expeditionDate) {
      const prev        = prevMonth(expeditionDate);
      const prevShort   = MONTHS_SHORT[prev.getMonth()];
      const currShort   = MONTHS_SHORT[expeditionDate.getMonth()];
      const prevFull    = MONTHS_FULL[prev.getMonth()];
      const currFull    = MONTHS_FULL[expeditionDate.getMonth()];
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN DE FECHAS — DOCUMENTO TIPO VERI MEDIC
      ═══════════════════════════════════════════════
      La fecha de expedición registrada en el sistema es: "${client.expedition}" (${fmtCarnet(expeditionDate)})

      REGLA: La fecha que aparece en este certificado médico DEBE corresponder
      al MES ACTUAL de expedición O al MES INMEDIATAMENTE ANTERIOR.

      Meses VÁLIDOS:
        • ${prevShort} ${prev.getFullYear()}  (${prevFull} ${prev.getFullYear()})
        • ${currShort} ${expeditionDate.getFullYear()}  (${currFull} ${expeditionDate.getFullYear()})

      Si la fecha del documento corresponde a cualquier otro mes/año → DISCREPANCIA GRAVE, penaliza fuerte el score.
      Reporta en "date_validation" la fecha exacta encontrada en el documento y si entra en el rango válido.
      ═══════════════════════════════════════════════`;
    }

    if (docType === 'CARNET' && expeditionDate && expiryDate) {
      dateSection = `
      ═══════════════════════════════════════════════
      VALIDACIÓN — DOCUMENTO TIPO CARNET (MULTI-PÁGINA)
      ═══════════════════════════════════════════════

      ⚠️ PÁGINAS: Este documento puede tener MÚLTIPLES PÁGINAS. Debes analizar y extraer
      información de TODAS las páginas, no solo la primera.

      ⚠️ IMÁGENES DECORATIVAS: El carnet puede contener imágenes o ilustraciones de fondo
      genéricas (p.ej. silueta de un perro, foto de animal de raza). Estas son elementos
      gráficos decorativos del diseño del carnet, NO son fotos reales de la mascota del cliente.
      QUEDA PROHIBIDO evaluar, comentar o penalizar basándose en estas imágenes decorativas.
      Solo evalúa los CAMPOS DE TEXTO del documento.

      VALIDACIÓN DE FECHAS — MUY IMPORTANTE:
      El sistema Petfly calculó estas fechas con precisión matemática. Debes respetarlas al pie de la letra.

      DATE OF ISSUE (Fecha de Expedición) ESPERADA:
        Día: ${expeditionDate.getDate()}, Mes: ${MONTHS_SHORT[expeditionDate.getMonth()]} (mes ${expeditionDate.getMonth()+1}), Año: ${expeditionDate.getFullYear()}
        Formatos equivalentes aceptados:
          • "${fmtCarnet(expeditionDate)}"
          • "${fmtSlash(expeditionDate)}"
          • "${fmtLong(expeditionDate)}"

      DUE DATE (Fecha de Vencimiento) ESPERADA  [expedición + ${validityYears} año(s) = ${client.certificate_validity}]:
        Día: ${expiryDate.getDate()}, Mes: ${MONTHS_SHORT[expiryDate.getMonth()]} (mes ${expiryDate.getMonth()+1}), AÑO OBLIGATORIO: ${expiryDate.getFullYear()}
        Formatos equivalentes aceptados:
          • "${fmtCarnet(expiryDate)}"
          • "${fmtSlash(expiryDate)}"
          • "${fmtLong(expiryDate)}"

      ⛔ CRÍTICO — REGLA DE ORO PARA DUE DATE:
        - La fecha de expedición es el año ${expeditionDate.getFullYear()}.
        - La validez es ${validityYears} año(s).
        - Por lo tanto, el DUE DATE DEBE tener el año ${expiryDate.getFullYear()} — NO ${expeditionDate.getFullYear() + 1}, NO ${expeditionDate.getFullYear() + 2}, SOLO ${expiryDate.getFullYear()}.
        - Si el documento muestra cualquier otro año en el DUE DATE → DISCREPANCIA GRAVE, penaliza el score severamente.
        - Ejemplo de error a detectar: si el doc dice "Apr/14/${expeditionDate.getFullYear() + 1}" pero lo correcto es "${fmtCarnet(expiryDate)}", eso ES una discrepancia grave.

      Si DATE OF ISSUE no coincide con la fecha de expedición esperada → DISCREPANCIA GRAVE.
      Si DUE DATE no coincide exactamente (día, mes Y AÑO) con la fecha de vencimiento calculada → DISCREPANCIA GRAVE.
      Penaliza el score de forma severa en cualquiera de los dos casos.
      Reporta en "date_validation" las fechas encontradas en el documento vs las esperadas, indicando explícitamente si el año coincide.
      ═══════════════════════════════════════════════`;
    }

    const prompt = `
      Eres un auditor legal multilingüe experto (Inglés/Español) para 'Petfly'.
      Tu objetivo es auditar la veracidad de este DOCUMENTO o CARNET (PDF o Imagen).
      Nombre del archivo analizado: "${filename}" (Tipo detectado: ${docType})

      ════════════════════════════════════════════════════════
      REGLA ABSOLUTA — NO PENALICES FECHAS SOLO POR SER FUTURAS
      ════════════════════════════════════════════════════════
      El sistema Petfly emite certificados con fechas de expedición y vencimiento FUTURAS con total normalidad.
      QUEDA TERMINANTEMENTE PROHIBIDO:
        - Marcar un documento como inválido O reducir el score SIMPLEMENTE porque su fecha sea futura.
        - Mencionar "fecha futura" como problema, irregularidad o sospecha de fraude.
        
      ⚠️ EXCEPCIÓN CRÍTICA - COINCIDENCIA DE FECHAS:
      Esto NO significa que aceptes cualquier fecha. Las fechas impresas en el documento DEBEN COINCIDIR EXACTAMENTE con las fechas ESPERADAS que se indican en este prompt. 
      Si la fecha esperada de vencimiento es en 2029, y el documento dice 2027, ESTO ES UNA DISCREPANCIA GRAVE Y DEBE SER REPORTADA Y PENALIZADA CON SEVERIDAD, independientemente de que ambas fechas estén en el futuro.
      ════════════════════════════════════════════════════════

      DATOS ESPERADOS DEL SISTEMA PETFLY:
      - HUMANO: Nombre: "${client.client_name}", ID/DNI/Pasaporte: "${client.client_id}", Teléfono: "${client.phone_number}", Dirección: "${client.address}", Género del Humano: "${client.client_gender}"
      - MASCOTA: Nombre: "${client.dog_name}", Edad: "${client.dog_age}", Raza: "${client.dog_breed}", Peso: "${client.dog_weight}", Género de la Mascota: "${client.dog_gender}", Número de Microchip: "${client.microchip_number}"
      - REQUISITOS: Fecha de Viaje: "${client.travel_date}"
      ${dateSection}

      FILOSOFÍA DE AUDITORÍA:
      1. SOLO EVALÚA LO QUE EXISTE: Compara únicamente los campos PRESENTES en el documento. Si un campo no aparece impreso, ignóralo.
      2. PRECISIÓN DE CARACTERES: Errores como "++" en teléfonos o IDs → penaliza en el score.
      3. ERRORES GRAMATICALES Y ORTOGRÁFICOS (SIEMPRE OBLIGATORIO):
         - Lee TODO el texto del documento buscando errores gramaticales, ortográficos o de redacción en cualquier idioma.
         - Ejemplos: palabras mal escritas, frases sin cohesión, puntuación incorrecta, mezcla errónea de idiomas, concordancia incorrecta.
         - SIEMPRE debes completar "spelling_and_grammar_notes". Si no hay errores escribe "Sin errores detectados". NUNCA dejes este campo vacío.
      4. CONSISTENCIA DE GÉNERO (CRÍTICO): Si la mascota es "${client.dog_gender}", usar "EL"/"Macho"/"Him"/"His" para una hembra (o viceversa) es DISCREPANCIA GRAVE → penaliza fuerte.
      5. FRAUDE VISUAL: Fuentes distintas, alineación pobre, datos que no encajan visualmente → sé severo con is_valid.

      REGLAS DE FORMATO Y RESPUESTA (JSON VÁLIDO SIN COMENTARIOS):
      {
        "is_valid": boolean,
        "score": number,
        "final_verdict": "string — resumen profesional en español basado SOLO en los campos presentes y las reglas aplicadas.",
        "analysis": {
          "human_match":                "string — campos del humano presentes y si coinciden.",
          "dog_match":                  "string — campos de la mascota presentes y si coinciden.",
          "date_validation":            "string — fechas encontradas en el doc vs fechas esperadas. Detalla el resultado.",
          "phone_validation":           "string — solo si el teléfono está presente en el documento.",
          "spelling_and_grammar_notes": "string — OBLIGATORIO: lista detallada de errores gramaticales/ortográficos, o 'Sin errores detectados'."
        }
      }
    `;

    const data = await callGeminiDirect(prompt, req.file.buffer, mimeType);
    const text = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(text);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

app.get('/api/test', async (req, res) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    await axios.post(url, { contents: [{ parts: [{ text: "Hi" }] }] });
    res.json({ message: "¡PETFLY ONLINE!", response: "Conectado" });
  } catch (error) {
    res.status(500).json({ error: "Error de conexión." });
  }
});

app.listen(PORT, () => console.log(`🚀 Comparador Petfly en puerto ${PORT}`));
