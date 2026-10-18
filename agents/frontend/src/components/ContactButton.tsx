import { openContactRelationship } from '../lib/contactNavigation';
import './crmRelationships.css';

export function ContactButton({ phone, name }: { phone?: string | null; name?: string | null }) {
    return <button type="button" className="contact-icon" disabled={!phone}
        title={phone ? `Contact relationship: ${name || 'contact'}` : 'Contact details are not available to this viewer'}
        aria-label={`Open contact relationship for ${name || 'contact'}`}
        onClick={event => { event.stopPropagation(); if (phone) openContactRelationship(phone, event.currentTarget); }}><span aria-hidden="true">C</span></button>;
}
