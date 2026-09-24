/**
 * What a WhatsApp property share delivers — mirrors backend ShareContent. The property
 * details text always goes; photos + videos are ticked by default, the PDF is opt-in.
 * Used by every inventory WhatsApp share dialog (single + batch, desktop + mobile).
 */
export type ShareContent = { photos: boolean; videos: boolean; pdf: boolean };
export const DEFAULT_SHARE_CONTENT: ShareContent = { photos: true, videos: true, pdf: false };

const OPTIONS: { key: keyof ShareContent; label: string }[] = [
    { key: 'photos', label: '🖼️ Photos' },
    { key: 'videos', label: '🎬 Videos' },
    { key: 'pdf', label: '📄 PDF' },
];

export default function ShareContentPicker({ value, onChange, disabled }: {
    value: ShareContent; onChange: (v: ShareContent) => void; disabled?: boolean;
}) {
    return (
        <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
            <legend style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', padding: 0 }}>
                Send (property details text is always included)
            </legend>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {OPTIONS.map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={value[key]}
                            onChange={e => onChange({ ...value, [key]: e.target.checked })}
                        />
                        {label}
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
