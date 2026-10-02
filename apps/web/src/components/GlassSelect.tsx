import type { ReactNode } from 'react'
import SettingsPopover from './SettingsPopover'

export type SelectOption<T extends string | number> = { value: T; label: string; disabled?: boolean }

export default function GlassSelect<T extends string | number>({ label, value, options, onChange, disabled, trigger, width = 256 }: {
  label: string; value: T; options: SelectOption<T>[]; onChange: (value: T) => void
  disabled?: boolean; trigger?: ReactNode; width?: number
}) {
  return <SettingsPopover label={label} disabled={disabled} glass width={width}
    triggerClassName="inline-flex items-center gap-1.5 text-inherit -ml-2"
    trigger={<>{trigger ?? options.find(option => option.value === value)?.label}
      <svg aria-hidden="true" className="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </>}>
    <div role="group" aria-label={label} className="flex flex-col gap-0.5">
      {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value}
        disabled={option.disabled} onClick={() => onChange(option.value)}
        className={`rounded-lg px-3 py-2 text-sm text-left text-foreground hover:text-secondary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed ${value === option.value ? 'bg-primary/15' : 'hover:bg-foreground/5'}`}>
        {option.label}
      </button>)}
    </div>
  </SettingsPopover>
}
