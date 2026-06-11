'use client';

export default function OfflinePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px', textAlign: 'center' }}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" aria-hidden="true">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginTop: '24px', color: '#1e293b' }}>You&apos;re offline</h1>
      <p style={{ color: '#64748b', marginTop: '8px', maxWidth: '320px' }}>Check your internet connection and try again.</p>
      <button onClick={() => window.location.reload()} style={{ marginTop: '24px', padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>
        Try again
      </button>
    </div>
  );
}
