import { detailGroups, display, ensureSaved, savedIdentifier, inventoryPath, mediaUri, propertyFrom } from './contracts';
it.each(['residential', 'commercial', 'agricultural'])('keeps authorized %s values, structured specifications and document metadata', category => {
  const p = propertyFrom({ id: 'test', formatted_demand_price: '₹40 Lakh', formatted_display_price: '₹42 Lakh', category, floor_number: 0, roof_rights: false, renovated: false, completion_pct: 0, customer_price: '0', specs: { bathrooms: 0, parking: [{ type: 'covered', count: 0 }], amenities: [], available: false }, media_urls: ['a.jpg', 'b.mp4'], video_urls: ['b.mp4'], can_edit: true, can_access_documents: true, actions: { edit: true, share: true }, documents: [{ id: 'doc', title: 'Deed', mime_type: 'application/pdf', file_size: 0, doc_type: 'title_deed', file_name: 'deed.pdf', created_at: '2026-10-18' }] });
  expect(p.demandPrice).toBe('₹40 Lakh'); expect(p.displayPrice).toBe('₹42 Lakh'); expect(p.fields.floor_number).toBe(0); expect(p.fields.roof_rights).toBe(false); expect(p.specs.bathrooms).toBe(0);
  expect(display(p.specs.parking)).toContain('Count: 0'); expect(display(p.specs.available)).toBe('No'); expect(display(p.specs.amenities)).toBe('None'); expect(p.videos).toEqual(['b.mp4']); expect(p.images).toEqual(['a.jpg']); expect(p.documents?.[0].size).toBe(0);
});
it('distinguishes restricted, missing and empty values and defaults capabilities to deny', () => {
  const p = propertyFrom({ id: 'test', restricted_fields: ['flat_no'], flat_no: undefined, full_address: null, documents: [] });
  expect(p.restricted).toEqual(['flat_no']); expect(p.fields.full_address).toBeNull(); expect(p.actions.edit).toBe(false); expect(p.documents).toEqual([]); expect(propertyFrom({ id: 'test' }).documents).toBeUndefined(); expect(display(undefined)).not.toBe(display(null));
});
it('requests bounded browse-all pages while honoring scope/filter/search parameters', () => {
  const path = inventoryPath(2, 'Sector & 0', { status: 'active', all: 'false' }), q = new URL('https://test.invalid' + path).searchParams;
  expect(q.get('limit')).toBe('25'); expect(q.get('page')).toBe('2'); expect(q.get('all')).toBe('false'); expect(q.get('search')).toBe('Sector & 0'); expect(inventoryPath(1, '', {})).toContain('all=true');
});
it('covers dynamic fields without leaking unknown payload fields', () => {
  const p = propertyFrom({ id: 'test', private_token: 'never', specs: { dynamic_plot_access: { road: false } } });
  expect(Object.keys(p.fields)).not.toContain('private_token'); expect(display(p.specs.dynamic_plot_access)).toContain('No'); expect(Object.values(detailGroups).flat()).toContain('pre_rented_monthly_rent');
});
it('rejects credential-bearing and private document image URLs', () => {
  expect(mediaUri('https://api.invalid', 'https://a:b@evil.invalid/x')).toBeUndefined(); expect(mediaUri('https://api.invalid', '/uploads/properties/x/documents/x.jpg')).toBeUndefined(); expect(mediaUri('https://api.invalid', '/uploads/properties/x.jpg')).toBe('https://api.invalid/uploads/properties/x.jpg');
});

it('treats malformed successful mutation/creation responses as ambiguous', () => {
  for (const value of [{}, [], null, { error: 'unconfirmed' }]) {
    try { ensureSaved(value); throw new Error('Expected rejection'); } catch (error) { expect(error).toEqual(expect.objectContaining({ ambiguous: true })); }
  }
  expect(savedIdentifier({ inventory_id: 'created' }, ['inventory_id'])).toBe('created');
  expect(() => savedIdentifier({ success: true })).toThrow('outcome is unknown');
});
