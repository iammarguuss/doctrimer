export const docSchema = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    doc_type: {
      type: 'string',
      enum: [
        'id_card','passport','receipt','invoice',
        'letter','certificate','contract','other','unknown'
      ]
    },
    language: { type: 'string' },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    extracted_text: { type: 'string' },
    entities: { type: 'object', additionalProperties: true }
  },
  required: ['doc_type', 'confidence'],
  additionalProperties: true
};
