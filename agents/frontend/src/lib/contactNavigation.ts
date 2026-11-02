import { drillTo, type DrillTarget } from './drill';

export const CONTACT_OPEN_EVENT = 'crm:open-contact';

/** Open above the existing view rather than replacing/unmounting its scroll containers. */
export function openContactRelationship(phone: string, trigger?: HTMLElement) {
    if (phone) window.dispatchEvent(new CustomEvent(CONTACT_OPEN_EVENT, { detail: { phone, trigger } }));
}

/** Browser Back is asynchronous. Navigate after its popstate so the old view cannot win. */
export function navigateFromContact(target: DrillTarget, close: () => void) {
    if (history.state?.relationship) {
        const navigate = () => drillTo(target);
        window.addEventListener('popstate', navigate, { once: true });
        try { close(); } catch (error) { window.removeEventListener('popstate', navigate); throw error; }
    } else {
        close();
        drillTo(target);
    }
}
