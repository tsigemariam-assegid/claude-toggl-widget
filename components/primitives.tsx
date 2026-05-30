// Shared layout primitives used across both panels.
import type { ReactNode, CSSProperties } from 'react';
import { Card } from '@/components/ui/card';

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 9,
      color: 'rgba(255,255,255,0.3)',
      fontFamily: 'monospace',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

export function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#f1f5f9', fontFamily: 'monospace', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// Bordered translucent panel — a compact shadcn Card.
export function Block({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <Card style={style} className="gap-0 rounded-[9px] px-[11px] py-[9px] shadow-none">
      {children}
    </Card>
  );
}
