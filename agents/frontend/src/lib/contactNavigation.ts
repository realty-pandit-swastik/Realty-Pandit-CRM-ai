export const CONTACT_OPEN_EVENT = 'crm:open-contact';

/** Open above the existing view rather than replacing/unmounting its scroll containers. */
export function openContactRelationship(phone: string, trigger?: HTMLElement) {
    if (phone) window.dispatchEvent(new CustomEvent(CONTACT_OPEN_EVENT, { detail: { phone, trigger } }));
}
