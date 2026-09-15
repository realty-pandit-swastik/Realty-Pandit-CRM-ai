import { describe, it, expect } from 'vitest';
import { detectFrustration } from '../utils/frustration';

describe('detectFrustration (Fix C)', () => {
    it('flags explicit call requests', () => {
        expect(detectFrustration('call me').escalate).toBe(true);
        expect(detectFrustration('please call').escalate).toBe(true);
        expect(detectFrustration('mujhe call karo').escalate).toBe(true);
        expect(detectFrustration('phone karo abhi').escalate).toBe(true);
        expect(detectFrustration('call me').kind).toBe('call_request');
    });

    it('flags "you keep talking but never call"', () => {
        expect(detectFrustration('bolte rehte ho par call to karta nahi').escalate).toBe(true);
        expect(detectFrustration('call nahi aaya').escalate).toBe(true);
    });

    it('flags requests to reach a human', () => {
        expect(detectFrustration('I want to talk to a human').escalate).toBe(true);
        expect(detectFrustration('connect me with an agent').escalate).toBe(true);
        expect(detectFrustration('kisi insaan se baat karni hai').escalate).toBe(true);
        expect(detectFrustration('talk to someone').kind).toBe('human_request');
    });

    it('flags anger / complaints', () => {
        expect(detectFrustration('this is useless').escalate).toBe(true);
        expect(detectFrustration('bakwaas service').escalate).toBe(true);
        expect(detectFrustration('ye to fraud hai').escalate).toBe(true);
        expect(detectFrustration('worst experience').kind).toBe('anger');
    });

    it('does NOT escalate normal messages', () => {
        expect(detectFrustration('hi').escalate).toBe(false);
        expect(detectFrustration('2 bhk in vaishali').escalate).toBe(false);
        expect(detectFrustration('ok thanks').escalate).toBe(false);
        expect(detectFrustration('what is the price').escalate).toBe(false);
        expect(detectFrustration('I missed your call earlier').escalate).toBe(false);
        expect(detectFrustration('are you an agent').escalate).toBe(false);
        expect(detectFrustration('cancel').escalate).toBe(false);
    });
});
