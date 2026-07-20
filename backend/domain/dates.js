const MONTHS_SHORT = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
const MONTHS_FULL = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

function validDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function parseExpedition(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  let match = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return validDate(Number(match[3]), Number(match[2]), Number(match[1]));
  match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  return null;
}

function parseValidity(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();
  const match = normalized.match(/(\d+)\s*(a(?:ñ|n)o|year|mes|month)/i);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  const unit = /mes|month/i.test(match[2]) ? 'months' : 'years';
  return { amount, unit, label: `${amount} ${unit === 'years' ? 'año(s)' : 'mes(es)'}` };
}

function addValidity(date, validity) {
  if (!date || !validity) return null;
  const result = new Date(date);
  if (validity.unit === 'years') result.setFullYear(result.getFullYear() + validity.amount);
  else result.setMonth(result.getMonth() + validity.amount);
  return result;
}

function fmtCarnet(date) {
  return `${MONTHS_SHORT[date.getMonth()]}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

function fmtSlash(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function fmtLong(date) {
  return `${MONTHS_FULL[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function fmtDash(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function prevMonth(date) {
  const result = new Date(date);
  result.setMonth(result.getMonth() - 1);
  return result;
}

module.exports = {
  MONTHS_SHORT,
  MONTHS_FULL,
  parseExpedition,
  parseValidity,
  addValidity,
  fmtCarnet,
  fmtSlash,
  fmtLong,
  fmtDash,
  prevMonth,
};
