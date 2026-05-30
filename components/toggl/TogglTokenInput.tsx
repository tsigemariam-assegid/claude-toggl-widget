import { useState } from 'react';
import { SectionLabel } from '@/components/primitives';

export function TogglTokenInput({ onSave }: { onSave: (t: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ padding: '12px 0' }}>
      <SectionLabel>Toggl API Token</SectionLabel>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, lineHeight: 1.5 }}>
        Get it at toggl.com/profile → scroll to "API Token"
      </p>
      <input
        type="password"
        placeholder="paste token here"
        value={val}
        onChange={e => setVal(e.target.value)}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7,
          padding: '6px 10px',
          color: '#f1f5f9',
          fontSize: 12,
          fontFamily: 'monospace',
          outline: 'none',
          marginBottom: 8,
        }}
      />
      <button
        onClick={() => val.trim() && onSave(val.trim())}
        style={{
          width: '100%',
          padding: '6px 0',
          background: 'rgba(193,95,60,0.2)',
          border: '1px solid rgba(193,95,60,0.3)',
          borderRadius: 7,
          color: '#C15F3C',
          fontSize: 11,
          fontFamily: 'monospace',
          cursor: 'pointer',
        }}
      >
        Save token
      </button>
    </div>
  );
}
