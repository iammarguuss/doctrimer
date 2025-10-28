export function normalizeString(s) { return (s ?? '').toString().trim(); }
export function normalizeDocType(s) {
  const t = (s ?? '').toString().toLowerCase();
  if (!t) return 'unknown';
  if (/(id\s*card|identity|titre\s*de\s*s[ée]jour|aufenthalts|permesso)/i.test(t)) return 'id_card';
  if (/(receipt|чек|товарный|ticket)/i.test(t)) return 'receipt';
  if (/(invoice|facture|rechnung)/i.test(t)) return 'invoice';
  if (/passport/i.test(t)) return 'passport';
  if (/(ректору|університет|директор|печать|штамп)/i.test(t)) return 'letter';
  return ['unknown','other'].includes(t) ? t : 'other';
}
