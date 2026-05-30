import { useState } from 'react';
import { SectionLabel } from '@/components/primitives';
import { Button } from '@/components/ui/button';

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
      <Button
        onClick={() => val.trim() && onSave(val.trim())}
        size="sm"
        className="w-full rounded-[7px] border border-[rgba(193,95,60,0.3)] bg-[rgba(193,95,60,0.2)] font-mono text-[11px] text-[#C15F3C] shadow-none hover:bg-[rgba(193,95,60,0.32)]"
      >
        Save token
      </Button>
    </div>
  );
}
