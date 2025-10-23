export const docSchema = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    doc_type: { type: 'string', enum: ['id_card', 'receipt', 'invoice', 'passport', 'other', 'unknown'] },
    language: { type: 'string' },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    extracted_text: { type: 'string' },
    entities: {
      type: 'object',
      properties: {
        merchant: { type: 'string' },
        date: { type: 'string' },
        total: { type: 'string' },
        currency: { type: 'string' },
        items: { type: 'array', items: { type: 'string' } },
        full_name: { type: 'string' },
        id_number: { type: 'string' },
        birth_date: { type: 'string' },
        expiry_date: { type: 'string' },
        issuing_country: { type: 'string' }
      },
      additionalProperties: true
    }
  },
  required: ['doc_type', 'confidence'],
  additionalProperties: true
};
