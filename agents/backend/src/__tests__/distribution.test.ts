import { describe, it, expect } from 'vitest';
import { classifyRoute } from '../utils/distribution';

describe('classifyRoute', () => {
  it('partner beats channel', () => {
    expect(classifyRoute({ source: '99acres', lead_type: 'PARTNER_REFERRAL', referral_partner_id: null })).toBe('Partner');
    expect(classifyRoute({ source: 'website', lead_type: null, referral_partner_id: 'p1' })).toBe('Partner');
  });
  it('maps known channels', () => {
    expect(classifyRoute({ source: '99acres' })).toBe('99acres');
    expect(classifyRoute({ source: 'magicbricks' })).toBe('MagicBricks');
    expect(classifyRoute({ source: 'whatsapp' })).toBe('WhatsApp');
    expect(classifyRoute({ source: 'manual' })).toBe('Manual');
    expect(classifyRoute({ source: null })).toBe('Other');
    expect(classifyRoute({ source: 'weird_thing' })).toBe('Other');
  });
});
