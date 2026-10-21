// Primitives d'habillage ABI (AbiDesign/components) : icône, bouton, panneau, champ.
import type { CSSProperties, ReactNode } from 'react';
import { ICONS } from './icons';

export function Icon({ name, size = 20, color, style }: { name: string; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none', display: 'block', ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  );
}

const VARIANTS = {
  primary: { bg: 'var(--abi-green)', fg: '#fff' },
  neutral: { bg: 'var(--surface-nav)', fg: '#ddd', bd: '1px solid var(--border-nav)' },
  rearm: { bg: 'var(--abi-tint-blue)', fg: '#a9bccf' },
  acknowledge: { bg: 'var(--abi-tint-brown)', fg: '#d9c7b4' },
  stop: { bg: 'var(--abi-tint-red)', fg: '#d9bfc2' },
  reset: { bg: 'var(--abi-tint-green)', fg: '#bcd3c7' },
  ghost: { bg: 'transparent', fg: 'var(--text-secondary)' },
} as const;

export type Variant = keyof typeof VARIANTS;

export function Button(props: {
  variant?: Variant;
  icon?: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  small?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const v = props.active ? { bg: 'var(--abi-green)', fg: '#fff', bd: '1px solid var(--abi-green)' } : VARIANTS[props.variant ?? 'neutral'];
  const h = props.small ? 28 : 34;
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title ?? undefined}
      disabled={props.disabled}
      onClick={props.onClick}
      className="abi-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: h,
        minWidth: h,
        padding: props.children ? '0 10px' : 0,
        background: v.bg,
        color: v.fg,
        border: 'bd' in v ? v.bd : '1px solid transparent',
        borderRadius: 3,
        font: `400 ${props.small ? 12 : 13}px var(--font-sans)`,
        whiteSpace: 'nowrap',
        cursor: props.disabled ? 'default' : 'pointer',
        opacity: props.disabled ? 0.4 : 1,
        ...props.style,
      }}
    >
      {props.icon && <Icon name={props.icon} size={props.small ? 16 : 18} />}
      {props.children}
    </button>
  );
}

// Titres et libellés en ReactNode : ils peuvent porter le terme technique en petit (<Term/>, <Abbr/> de i18n).
export function PanelHead({ icon, title, right }: { icon?: string; title: ReactNode; right?: ReactNode }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', height: 'var(--panel-head-h)', background: 'var(--surface-panel-header)', flex: 'none' }}>
      {icon && (
        <div style={{ width: 46, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #6c726e' }}>
          <Icon name={icon} size={22} color="#9aa29e" />
        </div>
      )}
      <h2 style={{ margin: 0, padding: '0 10px', font: 'var(--type-panel-title)', color: '#fff', textTransform: 'uppercase' }}>{title}</h2>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8 }}>{right}</div>
    </header>
  );
}

export function SectionHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 10px', background: 'var(--surface-panel-header)', margin: '18px 0 8px' }}>
      <span style={{ font: '700 13px var(--font-sans)', textTransform: 'uppercase', color: '#fff' }}>{title}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', font: '400 12px var(--font-sans)', color: 'var(--text-secondary)' }}>{right}</span>
    </div>
  );
}

export const inputStyle: CSSProperties = {
  height: 30,
  width: '100%',
  padding: '0 8px',
  background: 'var(--surface-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-input)',
  borderRadius: 2,
  font: '400 14px var(--font-sans)',
  outline: 'none',
};

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 10, margin: '6px 10px' }}>
      <span style={{ font: '700 13px var(--font-sans)', color: '#9aa49f' }}>{label}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {children}
        {hint && <span style={{ font: '400 12px var(--font-sans)', color: 'var(--text-muted)' }}>{hint}</span>}
      </span>
    </label>
  );
}

/** Interrupteur ABI (seul élément arrondi de l'habillage avec les disques du PID). */
export function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        border: 'none',
        padding: 0,
        position: 'relative',
        background: checked ? 'var(--abi-green)' : 'var(--abi-gray-550)',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'default' : 'pointer',
        flex: 'none',
      }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: 8, background: '#fff', transition: 'left var(--dur-fast) var(--ease-std)' }} />
    </button>
  );
}
