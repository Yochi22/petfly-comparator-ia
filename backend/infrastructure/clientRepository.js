const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

function mapClient(row) {
  const client = {
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
    expedition: row.get('expedition') || '',
    microchip_number: row.get('microchip_number'),
  };
  client.client_key = String(client.client_id || client.phone_number || '').trim();
  return client;
}

class GoogleSheetsClientRepository {
  constructor({ sheetId, serviceAccountEmail, privateKey, cacheTtlMs = 60_000 }) {
    const auth = new JWT({
      email: serviceAccountEmail?.replace(/"/g, '').trim(),
      key: privateKey?.replace(/"/g, '').replace(/\\n/g, '\n').replace(/\\r/g, ''),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.document = new GoogleSpreadsheet(sheetId, auth);
    this.cacheTtlMs = cacheTtlMs;
    this.cache = { clients: [], expiresAt: 0, loading: null };
  }

  async list({ force = false } = {}) {
    if (!force && this.cache.expiresAt > Date.now()) return this.cache.clients;
    if (this.cache.loading) return this.cache.loading;

    this.cache.loading = (async () => {
      await this.document.loadInfo();
      const rows = await this.document.sheetsByIndex[0].getRows();
      const clients = rows.map(mapClient);
      this.cache = { clients, expiresAt: Date.now() + this.cacheTtlMs, loading: null };
      return clients;
    })();

    try {
      return await this.cache.loading;
    } catch (error) {
      this.cache.loading = null;
      throw error;
    }
  }

  async findByKey(clientKey) {
    const normalizedKey = String(clientKey || '').trim();
    if (!normalizedKey) return null;
    const clients = await this.list();
    return clients.find(client => client.client_key === normalizedKey) || null;
  }
}

module.exports = { GoogleSheetsClientRepository, mapClient };
