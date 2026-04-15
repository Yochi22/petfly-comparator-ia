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
      VALIDACIÓN DE FECHAS — DOCUMENTO TIPO CARNET
      ═══════════════════════════════════════════════
      Fechas calculadas por el sistema Petfly:

      DATE OF ISSUE (Fecha de Expedición) ESPERADA:
        Formatos equivalentes aceptados:
          • "${fmtCarnet(expeditionDate)}"
          • "${fmtSlash(expeditionDate)}"
          • "${fmtLong(expeditionDate)}"

      DUE DATE (Fecha de Vencimiento) ESPERADA  [expedición + ${client.certificate_validity}]:
        Formatos equivalentes aceptados:
          • "${fmtCarnet(expiryDate)}"
          • "${fmtSlash(expiryDate)}"
          • "${fmtLong(expiryDate)}"

      Si DATE OF ISSUE no coincide con la fecha de expedición esperada → DISCREPANCIA GRAVE.
      Si DUE DATE no coincide con la fecha de vencimiento calculada → DISCREPANCIA GRAVE.
      Penaliza el score de forma severa en cualquiera de los dos casos.
      Reporta en "date_validation" las fechas encontradas en el documento y si coinciden con las esperadas.
      ═══════════════════════════════════════════════`;
    }

    const prompt = `
      Eres un auditor legal multilingüe experto (Inglés/Español) para 'Petfly'.
      Tu objetivo es auditar la veracidad de este DOCUMENTO o CARNET (PDF o Imagen).
      Nombre del archivo analizado: "${filename}" (Tipo detectado: ${docType})

      DATOS ESPERADOS DEL SISTEMA PETFLY:
      - HUMANO: Nombre: "${client.client_name}", ID/DNI/Pasaporte: "${client.client_id}", Teléfono: "${client.phone_number}", Dirección: "${client.address}", Género del Humano: "${client.client_gender}"
      - MASCOTA: Nombre: "${client.dog_name}", Edad: "${client.dog_age}", Raza: "${client.dog_breed}", Peso: "${client.dog_weight}", Género de la Mascota: "${client.dog_gender}", Número de Microchip: "${client.microchip_number}"
      - REQUISITOS: Fecha de Viaje: "${client.travel_date}"
      ${dateSection}

      FILOSOFÍA DE AUDITORÍA (LECTURA CRÍTICA):
      1. SOLO EVALÚA LO QUE EXISTE: Únicamente compara los campos que ESTÁN PRESENTES e impresos en el documento con los datos esperados. NO reportes ni penalices datos que no aparecen en el documento. Si un campo no está impreso, ignóralo.
      2. PRECISIÓN DE CARACTERES: Errores tipográficos como "++" en teléfonos o IDs → penaliza en el score.
      3. CONSISTENCIA DE GÉNERO (CRÍTICO): Si la mascota es "${client.dog_gender}", el uso de pronombres contrarios (ej. "EL"/"Macho"/"Him" para una hembra) es una DISCREPANCIA GRAVE.
      4. SOSPECHA DE FRAUDE: Inconsistencias visuales (fuentes distintas, alineación pobre) → sé severo con is_valid.

      REGLAS DE FORMATO Y RESPUESTA (RESPONDE ÚNICAMENTE EN JSON VÁLIDO SIN COMENTARIOS):
      {
        "is_valid": boolean,
        "score": number,
        "final_verdict": "string — resumen profesional en español basado SOLO en los campos presentes.",
        "analysis": {
          "human_match":             "string — campos del humano presentes en el doc y si coinciden.",
          "dog_match":               "string — campos de la mascota presentes en el doc y si coinciden.",
          "date_validation":         "string — resultado de la validación de fechas según las reglas del tipo de documento.",
          "phone_validation":        "string — solo si el teléfono está presente en el documento.",
          "spelling_and_grammar_notes": "string — discordancias de género u otros errores ortográficos detectados."
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
