import type { ReactNode } from 'react'
import CustomizationToolbar from './CustomizationToolbar'
import SettingsPopover from './SettingsPopover'
import type { useDashboardLayout } from '../hooks/useDashboardLayout'
import { DASHBOARD_METRICS, resetDashboardLayout, type DashboardMetric } from '../utils/dashboardLayout'

const control = 'rounded px-2 py-1.5 text-sm hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed'

export default function DashboardCustomize({ preferences, aiAvailable = false, briefing }: {
  preferences: ReturnType<typeof useDashboardLayout>; aiAvailable?: boolean; briefing?: ReactNode
}) {
  const { layout, editing, setDraft, query, save, start, cancel } = preferences
  const disabled = save.isPending
  return <>
    <CustomizationToolbar title={editing ? 'Customizing Your Dashboard…' : 'Your Dashboard'} editing={editing} glass content={editing ? undefined : briefing}>
      {editing ? <>
        <SettingsPopover label="Summary metrics" trigger="Summary metrics" disabled={disabled} glass>
          <fieldset disabled={disabled} className="space-y-3 p-1">
            <legend className="sr-only">Summary metrics</legend>
            {layout.metrics.map((metric, index) => <label key={index} className="block text-sm">
              <span className="block text-secondary mb-1">{['Left', 'Middle', 'Right'][index]} metric</span>
              <select value={metric} className="w-full rounded border border-border-control bg-foreground/5 p-2 text-foreground focus-visible:ring-2 focus-visible:ring-primary"
                onChange={event => {
                  const metrics = [...layout.metrics] as typeof layout.metrics
                  metrics[index] = event.target.value as DashboardMetric
                  setDraft({ ...layout, metrics })
                }}>
                {Object.entries(DASHBOARD_METRICS).map(([id, label]) => <option key={id} value={id}
                  disabled={id !== metric && layout.metrics.includes(id as DashboardMetric)}>{label}</option>)}
              </select>
            </label>)}
          </fieldset>
        </SettingsPopover>
        <SettingsPopover label="Dashboard sections" trigger="Sections" disabled={disabled} glass>
          <fieldset disabled={disabled}>
            <legend className="sr-only">Dashboard sections</legend>
            {([['showPerformance', 'Portfolio Performance'], ['showJournal', 'Journal'], ['showBriefing', 'AI briefing']] as const).filter(([key]) => key !== 'showBriefing' || aiAvailable).map(([key, label]) =>
              <label key={key} className="flex items-center gap-2 p-2 text-sm cursor-pointer rounded hover:bg-foreground/5">
                <input type="checkbox" className="accent-primary" checked={layout[key]}
                  onChange={event => setDraft({ ...layout, [key]: event.target.checked })} />{label}
              </label>)}
          </fieldset>
        </SettingsPopover>
        <button className={control} disabled={disabled} onClick={() => setDraft(resetDashboardLayout(layout))}>Reset layout</button>
        <span aria-hidden="true" className="mx-2 h-4 w-px bg-foreground/10" />
        <button className={control} disabled={disabled} onClick={cancel}>Cancel</button>
        <button className={`${control} bg-foreground/10 text-foreground`} disabled={disabled}
          onClick={() => save.mutate(layout)}>{disabled ? 'Saving…' : 'Done'}</button>
      </> : <button className={control} disabled={!query.data} onClick={start}>Customize</button>}
    </CustomizationToolbar>
    {query.error && <p role="alert" className="text-sm text-error mb-4">Could not load your dashboard preferences.{' '}
      <button className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    {save.error && <p role="alert" className="text-sm text-error mb-4">Could not save your dashboard preferences. Please try again.</p>}
  </>
}
