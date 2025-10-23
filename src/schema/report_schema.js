export const reportSchema = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    doc_type: { type: 'string' },
    language: { type: 'string' },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    important_fields: { type: 'array', items: { type: 'string' } },
    entities: { type: 'object', additionalProperties: true },
    index_terms: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } }
  },
  required: ['doc_type', 'summary', 'entities'],
  additionalProperties: true
};
