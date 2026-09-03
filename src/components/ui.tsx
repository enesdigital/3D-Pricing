import type { ReactNode } from 'react'

export function Card({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-900/60 ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-200">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Field({ label, hint, children, inline }: { label: ReactNode; hint?: ReactNode; children: ReactNode; inline?: boolean }) {
  return (
    <label className={`block ${inline ? 'flex items-center justify-between gap-3' : ''}`}>
      <span className="block text-xs font-medium text-zinc-400">{label}</span>
      <div className={inline ? '' : 'mt-1'}>{children}</div>
      {hint && <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{hint}</span>}
    </label>
  )
}

export function NumberInput({ value, onChange, min, max, step, suffix, className = '' }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; className?: string
}) {
  return (
    <div className={`flex items-center rounded-md border border-zinc-700 bg-zinc-950 focus-within:border-sky-500 ${className}`}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min} max={max} step={step ?? 'any'}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v) }}
        className="w-full min-w-0 bg-transparent px-2 py-1.5 text-sm text-zinc-100 outline-none"
      />
      {suffix && <span className="shrink-0 pr-2 text-xs text-zinc-500">{suffix}</span>}
    </div>
  )
}

export interface SelectOption<T extends string> { value: T; label: string; disabled?: boolean }
export interface SelectGroup<T extends string> { label: string; options: SelectOption<T>[] }

export function Select<T extends string>({ value, onChange, options, groups, className = '', ariaLabel, title }: {
  value: T; onChange: (v: T) => void; options?: SelectOption<T>[]; groups?: SelectGroup<T>[]; className?: string; ariaLabel?: string; title?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={ariaLabel}
      title={title}
      className={`w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-500 ${className}`}
    >
      {options?.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      {groups?.filter((g) => g.options.length > 0).map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

export function Button({ children, onClick, variant = 'secondary', className = '', type = 'button', disabled, title, ariaLabel }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; className?: string; type?: 'button' | 'submit'; disabled?: boolean; title?: string; ariaLabel?: string
}) {
  const v = {
    primary: 'bg-sky-600 hover:bg-sky-500 text-white',
    secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700',
    ghost: 'hover:bg-zinc-800 text-zinc-300',
    danger: 'bg-red-900/50 hover:bg-red-800/60 text-red-200 border border-red-900',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}>
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-sky-500" />
      {label}
    </label>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg bg-zinc-950/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-base font-semibold text-zinc-100 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500">{sub}</div>}
    </div>
  )
}
