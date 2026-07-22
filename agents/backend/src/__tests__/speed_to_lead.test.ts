import { describe, it, expect } from 'vitest';
import { stlBucket } from '../services/speed_to_lead';

describe('stlBucket', () => {
  it('buckets first-response minutes into bands', () => {
    expect(stlBucket(0)).toBe('<5m');
    expect(stlBucket(4.9)).toBe('<5m');
    expect(stlBucket(5)).toBe('5–30m');
    expect(stlBucket(29)).toBe('5–30m');
    expect(stlBucket(30)).toBe('30m–2h');
    expect(stlBucket(119)).toBe('30m–2h');
    expect(stlBucket(120)).toBe('2–24h');
    expect(stlBucket(1439)).toBe('2–24h');
    expect(stlBucket(1440)).toBe('>24h');
    expect(stlBucket(5000)).toBe('>24h');
  });
});
