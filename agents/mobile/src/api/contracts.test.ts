import { leadsFrom, propertiesFrom, propertyFrom, sessionFrom, tasksFrom } from './contracts';
it('keeps empty data distinct from malformed responses and preserves server price strings', () => {
  expect(leadsFrom({ leads: [], total: 0 })).toEqual({ rows: [], total: 0 });
  expect(() => leadsFrom({ error: 'failed' })).toThrow();
  expect(() => tasksFrom({ tasks: [{ title: 'Missing id' }], total: 1 })).toThrow();
  const property = propertiesFrom({ data: [{ id: 'synthetic', display_id: 'RP-SYNTHETIC', formatted_price: '₹40 Lakh', can_edit: false, media_urls: [] }], total: 1 }).rows[0];
  expect(property.price).toBe('₹40 Lakh'); expect(property.canEdit).toBe(false);
  expect(() => sessionFrom({ token: 'x', agent: {} })).toThrow();
});

it('distinguishes restricted documents from an empty document list', () => {
  const property = { id: 'synthetic', media_urls: [] };
  expect(propertyFrom(property).documents).toBeUndefined();
  expect(propertyFrom({ ...property, documents: [] }).documents).toEqual([]);
  expect(propertyFrom({ ...property, documents: [{ id: 'doc', title: 'Synthetic PDF', mime_type: 'application/pdf' }] }).documents).toEqual([{ id: 'doc', title: 'Synthetic PDF', mimeType: 'application/pdf' }]);
  expect(() => propertyFrom({ ...property, documents: [{ id: 'doc' }] })).toThrow();
});
