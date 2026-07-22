import React, { useEffect, useState } from 'react';
import { getTeamTargets, updateTeamTargets } from '../../../api/client';
import { useToast } from '../../../contexts/ToastContext';
import { ClayCard } from './clay';

/**
 * TargetsEditor (Phase 5B) — a manager sets their team's MONTHLY productivity targets.
 *
 * Rendered only for users with `manage_team`. Every agent on the User Performance tab is scored
 * against the targets set here (falling back to sensible defaults when a manager has none). Saving
 * calls `onSaved()` so the parent dashboard reloads and the scores reflect the change immediately.
 * Monthly figures are pro-rated to the dashboard's date range server-side (scaleTargets).
 */

interface TargetVals { leads: number; appointments: number; inventory: number; conversion_rate: number; }
const FALLBACK: TargetVals = { leads: 30, appointments: 15, inventory: 10, conversion_rate: 0.2 };

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 14, fontWeight: 700,
  color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)', borderRadius: 8, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'block',
};

export const TargetsEditor: React.FC<{ onSaved?: () => void }> = ({ onSaved }) => {
  const { showToast } = useToast();
  const [vals, setVals] = useState<TargetVals | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getTeamTargets()
      .then((r) => {
        const t = r?.targets;
        setVals(t ? {
          leads: t.leads ?? 30,
          appointments: t.appointments ?? 15,
          inventory: t.inventory ?? 10,
          conversion_rate: t.conversionRate ?? t.conversion_rate ?? 0.2,
        } : FALLBACK);
      })
      .catch(() => setVals(FALLBACK));
  }, []);

  const v = vals ?? FALLBACK;
  const set = (k: keyof TargetVals, n: number) => setVals({ ...v, [k]: isFinite(n) ? n : 0 });

  const save = async () => {
    setBusy(true);
    try {
      await updateTeamTargets({
        leads: Math.max(0, Math.round(v.leads)),
        appointments: Math.max(0, Math.round(v.appointments)),
        inventory: Math.max(0, Math.round(v.inventory)),
        conversion_rate: Math.min(1, Math.max(0, v.conversion_rate)),
      });
      showToast('Team targets saved — scores updated.', 'success');
      setOpen(false);
      onSaved?.();
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Could not save targets.', 'error');
    }
    setBusy(false);
  };

  const btn = (label: string, onClick: () => void, primary = false): React.ReactNode => (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
        borderRadius: 8, border: `1px solid ${primary ? '#8b5cf6' : 'var(--border-primary)'}`,
        color: primary ? '#fff' : 'var(--text-secondary)',
        backgroundColor: primary ? '#8b5cf6' : 'transparent', opacity: busy ? 0.6 : 1,
      }}
    >{label}</button>
  );

  return (
    <ClayCard
      title="🎯 Monthly Targets"
      subtitle="Your team is scored against these. Monthly figures are pro-rated to the selected date range."
      accent="#8b5cf6"
      right={
        open
          ? <div style={{ display: 'flex', gap: 8 }}>{btn('Cancel', () => setOpen(false))}{btn(busy ? 'Saving…' : 'Save', save, true)}</div>
          : btn('Edit targets', () => setOpen(true), true)
      }
    >
      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, marginTop: 4 }}>
          <div><label style={labelStyle}>Leads / mo</label>
            <input type="number" min={0} style={inputStyle} value={v.leads}
              onChange={(e) => set('leads', parseInt(e.target.value, 10))} /></div>
          <div><label style={labelStyle}>Appointments / mo</label>
            <input type="number" min={0} style={inputStyle} value={v.appointments}
              onChange={(e) => set('appointments', parseInt(e.target.value, 10))} /></div>
          <div><label style={labelStyle}>Inventory / mo</label>
            <input type="number" min={0} style={inputStyle} value={v.inventory}
              onChange={(e) => set('inventory', parseInt(e.target.value, 10))} /></div>
          <div><label style={labelStyle}>Conversion %</label>
            <input type="number" min={0} max={100} style={inputStyle} value={Math.round(v.conversion_rate * 100)}
              onChange={(e) => set('conversion_rate', (parseFloat(e.target.value) || 0) / 100)} /></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginTop: 2 }}>
          {([['Leads', v.leads], ['Appointments', v.appointments], ['Inventory', v.inventory], ['Conversion', `${Math.round(v.conversion_rate * 100)}%`]] as Array<[string, React.ReactNode]>).map(([k, val]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{val}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k} / mo</span>
            </div>
          ))}
        </div>
      )}
    </ClayCard>
  );
};
