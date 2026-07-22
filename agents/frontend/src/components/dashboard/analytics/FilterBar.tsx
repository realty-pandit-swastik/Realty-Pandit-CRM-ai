import React, { useState } from 'react';

export type PresetKey =
  | 'today' | 'yesterday' | '3d' | '7d' | '14d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom';

export interface DateRange { preset: PresetKey; from: Date; to: Date; }

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '3d', label: '3D' },
  { key: '7d', label: '7D' },
  { key: '14d', label: '14D' },
  { key: '30d', label: '30D' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'custom', label: 'Custom' },
];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export function presetRange(preset: PresetKey, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case '3d': return { from: startOfDay(new Date(now.getTime() - 2 * 86400000)), to: endOfDay(now) };
    case '7d': return { from: startOfDay(new Date(now.getTime() - 6 * 86400000)), to: endOfDay(now) };
    case '14d': return { from: startOfDay(new Date(now.getTime() - 13 * 86400000)), to: endOfDay(now) };
    case '30d': return { from: startOfDay(new Date(now.getTime() - 29 * 86400000)), to: endOfDay(now) };
    case 'thisMonth': return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(first), to: endOfDay(last) };
    }
    case 'custom': {
      const f = customFrom ? startOfDay(new Date(customFrom)) : startOfDay(new Date(now.getTime() - 29 * 86400000));
      const t = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
      return { from: f, to: t };
    }
  }
}

export function defaultRange(): DateRange {
  // 2026-07-22: default range changed 30d -> today (owner request). All five dashboard
  // tabs (Main, Lead Intelligence, User Performance, Team Performance, Property Analytics)
  // import this one helper, so the default lives in exactly one place.
  const { from, to } = presetRange('today');
  return { preset: 'today', from, to };
}

interface MultiSelectProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[] | null; // null = all
  onChange: (v: string[] | null) => void;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const count = selected === null ? 0 : selected.length;
  const trigger = count === 0 ? `${label}: All` : `${label}: ${count}`;
  const toggle = (val: string) => {
    if (selected === null) { onChange(options.filter((o) => o.value !== val).map((o) => o.value)); return; }
    const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val];
    onChange(next.length === options.length ? null : next);
  };
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="chip chip-inactive"
        style={{ minHeight: 36 }}
      >
        {trigger} <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41,
            backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
            borderRadius: 12, boxShadow: 'var(--shadow-clay)', padding: 8, minWidth: 200,
            maxHeight: 280, overflowY: 'auto',
          }}>
            <button
              onClick={() => onChange(null)}
              style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: selected === null ? 'var(--bg-active)' : 'transparent', color: 'var(--text-primary)', fontSize: 13, fontWeight: selected === null ? 700 : 500 }}
            >
              {selected === null ? '● ' : '○ '}All {label.toLowerCase()}
            </button>
            {options.map((o) => {
              const on = selected === null || selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <span style={{ color: on ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{on ? '☑' : '☐'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

interface FilterBarProps {
  range: DateRange;
  onRange: (r: DateRange) => void;
  agentOptions: Array<{ value: string; label: string }>;
  selectedAgents: string[] | null;
  onAgents: (v: string[] | null) => void;
  sourceOptions: Array<{ value: string; label: string }>;
  selectedSources: string[] | null;
  onSources: (v: string[] | null) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  range, onRange, agentOptions, selectedAgents, onAgents, sourceOptions, selectedSources, onSources,
}) => {
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const pickPreset = (key: PresetKey) => {
    if (key === 'custom') {
      const { from, to } = presetRange('custom', customFrom, customTo);
      onRange({ preset: 'custom', from, to });
    } else {
      const { from, to } = presetRange(key);
      onRange({ preset: key, from, to });
    }
  };

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 30,
      backgroundColor: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border-primary)',
      padding: '12px 0', marginBottom: 4,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => pickPreset(p.key)}
            className={`chip ${range.preset === p.key ? 'chip-active' : 'chip-inactive'}`}
            style={{ minHeight: 34, fontSize: 13, padding: '5px 12px' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {range.preset === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-secondary)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-secondary)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
          <button onClick={() => pickPreset('custom')} className="chip chip-active" style={{ minHeight: 34 }}>Apply</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <MultiSelect label="Agents" options={agentOptions} selected={selectedAgents} onChange={onAgents} />
        <MultiSelect label="Sources" options={sourceOptions} selected={selectedSources} onChange={onSources} />
      </div>
    </div>
  );
};

/** Date-only sticky bar — reused by dashboards that only need the range picker. */
export const RangeBar: React.FC<{ range: DateRange; onRange: (r: DateRange) => void; right?: React.ReactNode }> = ({ range, onRange, right }) => {
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const pickPreset = (key: PresetKey) => {
    const { from, to } = key === 'custom' ? presetRange('custom', customFrom, customTo) : presetRange(key);
    onRange({ preset: key, from, to });
  };
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 30,
      backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-primary)',
      padding: '12px 0', marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => pickPreset(p.key)}
            className={`chip ${range.preset === p.key ? 'chip-active' : 'chip-inactive'}`}
            style={{ minHeight: 34, fontSize: 13, padding: '5px 12px' }}>
            {p.label}
          </button>
        ))}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
      {range.preset === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-secondary)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-secondary)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
          <button onClick={() => pickPreset('custom')} className="chip chip-active" style={{ minHeight: 34 }}>Apply</button>
        </div>
      )}
    </div>
  );
};
