
import { type ReactNode } from 'react';

export function MobileScrollWrapper({ children }: { children: ReactNode }) {
    return (
        <div style={{
            width: '100%',
            maxWidth: '100vw',
            overflowX: 'auto',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '16px',
            minHeight: 0,
        }}>
            {children}
        </div>
    );
}
