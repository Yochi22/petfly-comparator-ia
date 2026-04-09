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
      await new Promise(resolve => setTimeout(resolve, 3000));
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
      phone_number: row.get('phone_number'),
      client_email: row.get('client_email'),
      client_name: row.get('client_name'),
      client_id: row.get('client_id'),
      address: row.get('address'),
      travel_date: row.get('travel_date'),
      client_gender: row.get('client_gender'),
      dog_gender: row.get('dog_gender'),
      dog_name: row.get('dog_name'),
      dog_age: row.get('dog_age'),
      dog_breed: row.get('dog_breed'),
      dog_weight: row.get('dog_weight'),
      certificate_validity: row.get('certificate_validity'),
      microchip_number: row.get('microchip_number'),
      pdf_keyword: row.get('pdf_keyword') || '',
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/validate', upload.single('file'), async (req, res) => {
  try {
    const { expectedData } = req.body;
    const client = JSON.parse(expectedData);
    const mimeType = req.file.mimetype; 
    
    const prompt = `
      Eres un auditor legal multilingüe experto (Inglés/Español) para 'Petfly'. 
      Tu objetivo es analizar con precisión y exigencia extrema este DOCUMENTO o CARNET (PDF o Imagen).
      
      DATOS ESPERADOS DEL SISTEMA PETFLY:
      - HUMANO: Nombre: "${client.client_name}", ID/DNI/Pasaporte: "${client.client_id}", Teléfono: "${client.phone_number}", Email: "${client.client_email}", Dirección: "${client.address}", Género del Humano: "${client.client_gender}"
      - MASCOTA: Nombre: "${client.dog_name}", Edad: "${client.dog_age}", Raza: "${client.dog_breed}", Peso: "${client.dog_weight}", Género de la Mascota: "${client.dog_gender}", Número de Microchip: "${client.microchip_number}"
      - REQUISITOS: Fecha de Viaje: "${client.travel_date}", Vigencia Certificado: "${client.certificate_validity}"

      INSTRUCCIONES DE VALIDACIÓN CRÍTICAS, SIGUE ESTOS PASOS:
      1. COINCIDENCIA DE DATOS Y ORTOGRAFÍA: Compara cada dato de los "DATOS ESPERADOS" con la información visual del documento. Sé tolerante con errores tipográficos sutiles o variaciones ortográficas menores (ej. acentos faltantes, iniciales), pero penaliza discrepancias grandes o datos faltantes evidentes. Evalúa tanto en inglés como en español de forma transparente.
      2. GÉNEROS GRAMATICALES (MUY IMPORTANTE): Revisa explícitamente el género de la mascota y del humano. El género en el documento debe coincidir conceptualmente (ej. "Macho/Hembra", "Male/Female", "M/F") con los DATOS ESPERADOS. Señala esto explícitamente.
      3. CÓDIGO QR Y ENLACES WEB:
         - Si existe un Código QR, debes identificar la URL o el texto incrustado en él.
         - Revisa que la URL sea válida y lógica para un carnet veterinario o de registro.
         - Comprueba si en la URL o texto del QR se perciben indicios de coincidencia con el Microchip, Nombre de Mascota o Dueño. 
         - Si el QR o enlace contiene información que NO coincide, repórtalo gravemente.
      
      REGLAS DE FORMATO Y RESPUESTA (DEBES RESPONDER ÚNICAMENTE EN JSON VÁLIDO SIN COMENTARIOS, SÓLO ESTAS CLAVES EXACTAMENTE):
      {
        "is_valid": boolean,
        "score": number,
        "final_verdict": "string",
        "qr_code_info": {
          "found": boolean,
          "url": "string o null",
          "is_valid_url": boolean,
          "matches_data": boolean,
          "qr_analysis_details": "string"
        },
        "analysis": {
          "human_match": "string",
          "dog_match": "string",
          "spelling_and_grammar_notes": "string"
        }
      }
    `;
    
    const data = await callGeminiDirect(prompt, req.file.buffer, mimeType);
    const text = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
    res.json(JSON.parse(text));
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
