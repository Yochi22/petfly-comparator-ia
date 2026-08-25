const dns = require('node:dns').promises;
const net = require('node:net');
const axios = require('axios');
const { extractCertificateNumbers, normalizeCertificateNumber } = require('../domain/certificateReference');

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (address.startsWith('::ffff:')) return isPrivateAddress(address.slice(7));
  return address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:');
}

async function assertPublicHttpsUrl(rawUrl) {
  const url = new URL(String(rawUrl || '').trim());
  if (url.protocol !== 'https:') throw new Error('El QR no dirige a una URL HTTPS.');
  if (url.username || url.password || url.port) throw new Error('La URL del QR contiene credenciales o un puerto no permitido.');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error('La URL del QR no dirige a un servidor público permitido.');
  }
  return url;
}

async function verifyQrPage(rawUrl, expectedNumber, { timeoutMs = 10_000, maxRedirects = 3 } = {}) {
  if (!rawUrl) return { status: 'UNREADABLE', number: '', url: '', message: 'No se pudo leer la URL del QR.' };
  if (!normalizeCertificateNumber(expectedNumber)) return { status: 'UNREADABLE', number: '', url: '', message: 'No se pudo extraer el número visible de ADI.' };
  let url = await assertPublicHttpsUrl(rawUrl);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const response = await axios.get(url.toString(), {
      timeout: timeoutMs, maxRedirects: 0, maxContentLength: 1_000_000, responseType: 'text',
      validateStatus: status => (status >= 200 && status < 300) || (status >= 300 && status < 400),
      headers: { 'User-Agent': 'PetflyDocumentAuditor/1.0' },
    });
    if (response.status >= 300) {
      if (!response.headers.location || redirect === maxRedirects) throw new Error('La página del QR excedió los redireccionamientos permitidos.');
      url = await assertPublicHttpsUrl(new URL(response.headers.location, url).toString());
      continue;
    }
    const expected = normalizeCertificateNumber(expectedNumber);
    const urlNumbers = extractCertificateNumbers([...url.searchParams.values()].join(' '));
    if (urlNumbers.length) {
      const urlMatch = urlNumbers.find(number => normalizeCertificateNumber(number) === expected);
      return urlMatch
        ? { status: 'MATCH', number: urlMatch, url: url.toString(), message: 'Número confirmado en la URL de la página de verificación del QR.' }
        : { status: 'MISMATCH', number: urlNumbers[0], url: url.toString(), message: 'El número solicitado por la página del QR no coincide con el número visible en ADI.' };
    }
    const text = String(response.data || '').replace(/<[^>]+>/g, ' ');
    const numbers = extractCertificateNumbers(text);
    const pageText = normalizeCertificateNumber(text);
    const matched = expected && pageText.includes(expected)
      ? (numbers.find(number => normalizeCertificateNumber(number) === expected) || expectedNumber)
      : '';
    return matched
      ? { status: 'MATCH', number: matched, url: url.toString(), message: 'Número confirmado en la página del QR.' }
      : { status: 'MISMATCH', number: numbers[0] || '', url: url.toString(), message: 'La página del QR no contiene el número visible en ADI.' };
  }
  throw new Error('No se pudo consultar la página del QR.');
}

module.exports = { isPrivateAddress, assertPublicHttpsUrl, verifyQrPage };
