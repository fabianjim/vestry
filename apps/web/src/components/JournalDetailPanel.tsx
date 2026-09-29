import { JOURNAL_STYLES, journalBadge } from '../constants/journalStyles'
import { useEffect, useState, useMemo, useRef } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import type { JournalEntry } from '../types/journal'
import type { Transaction } from '../types/transaction'
import type { StockHistoryPoint } from '../types/stock'
import { journalApi } from '../services/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { journalQueries, portfolioQueries, stockQueries } from '../services/queries'
import { refreshJournal } from '../services/queryUpdates'
import { formatDateTime } from '../utils/dateUtils'
import {
  getPriceChange,
  getRecordedRangeSinceEntry,
  getRealizedPnLForSell,
  matchJournalTransaction,
} from '../utils/stockStats'
import { buildPriceHistory, formatPriceHistoryDate, getPriceHistoryColor, type PriceHistoryRange } from '../utils/priceHistory'
import PriceHistoryRangeSelector from './PriceHistoryRangeSelector'
import { marketDateKey } from '../utils/calendarSelection'
import { formatCurrency, formatSignedCurrencyWithPercent } from '../utils/formatUtils'
import { getDisplayBody, parseTagsFromBody } from '../utils/tagUtils'
import JournalSourceQuote from './JournalSourceQuote'
import { useJournalSources } from '../hooks/useJournalSources'

type Props = {
  entry: JournalEntry
  onEntryCreated: (entry: JournalEntry) => void
  onClose: () => void
  onEntryClick: (entry: JournalEntry) => void
}

const EMPTY_HISTORY: StockHistoryPoint[] = []
const EMPTY_ENTRIES: JournalEntry[] = []
const EMPTY_TRANSACTIONS: Transaction[] = []

export default function JournalDetailPanel({ entry, onClose, onEntryClick, onEntryCreated }: Props) {
  const client = useQueryClient()
  const ticker = entry.ticker ?? ''
  const transactionsQuery = useQuery({ ...portfolioQueries.transactions(), enabled: !!ticker })
  const transactions = ticker ? transactionsQuery.data ?? EMPTY_TRANSACTIONS : EMPTY_TRANSACTIONS
  const firstTrackingDate = useMemo(() => transactions
    .filter(tx => tx.ticker === ticker)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]?.timestamp,
  [transactions, ticker])
  const historyQuery = useQuery({
    ...stockQueries.history(ticker, firstTrackingDate),
    enabled: !!ticker && !!transactionsQuery.data,
  })
  const journalQuery = useQuery({ ...journalQueries.ticker(ticker), enabled: !!ticker })
  const stockQuery = useQuery({ ...stockQueries.snapshot(ticker), enabled: !!ticker })
  const history = ticker ? historyQuery.data ?? EMPTY_HISTORY : EMPTY_HISTORY
  const relatedEntries = useMemo(() => ticker
    ? (journalQuery.data ?? EMPTY_ENTRIES).filter(item => item.id !== entry.id) : EMPTY_ENTRIES,
  [journalQuery.data, entry.id, ticker])
  const currentStock = ticker ? stockQuery.data?.stock ?? null : null
  const loading = !!ticker && (transactionsQuery.isPending || historyQuery.isLoading)
  const error = ticker ? (transactionsQuery.error ?? historyQuery.error ?? journalQuery.error ?? stockQuery.error)?.message : undefined
  const containerRef = useRef<HTMLDivElement>(null)
  const [reflecting, setReflecting] = useState(false)
  const [reflectionBody, setReflectionBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const savingRef = useRef(false)
  const reflectionInputRef = useRef<HTMLTextAreaElement>(null)
  const knownEntries = useMemo(() => [entry, ...relatedEntries], [entry, relatedEntries])
  const sources = useJournalSources(knownEntries)
  const sourceEntry = entry.sourceEntryId != null ? sources.get(entry.sourceEntryId) : null
  const comparison = getPriceChange(sourceEntry?.priceSnapshot ?? null, entry.priceSnapshot)

  useEffect(() => {
    if (reflecting) reflectionInputRef.current?.focus()
  }, [reflecting])

  const saveReflection = async () => {
    if (savingRef.current || !reflectionBody.trim()) return
    const { body, tags } = parseTagsFromBody(reflectionBody)
    if (!getDisplayBody(body).trim()) {
      setSaveError('Please enter a reflection, not just tags.')
      return
    }
    if (body.length > 2000) {
      setSaveError('Please keep your reflection within 2000 characters.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    try {
      const saved = await journalApi.createEntry({ entryType: 'REFLECTION', sourceEntryId: entry.id, body, tags }) as JournalEntry
      await refreshJournal(client)
      setReflectionBody('')
      setReflecting(false)
      onEntryCreated(saved)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save reflection')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [entry.id])

  const matchedTransaction = useMemo(
    () => matchJournalTransaction(entry, transactions),
    [entry, transactions]
  )

  const [historyRange, setHistoryRange] = useState<PriceHistoryRange>('all')
  const chartData = useMemo(() => buildPriceHistory(history,
    entry.entryType === 'REFLECTION' ? [sourceEntry, entry] : [entry], historyRange), [history, entry, sourceEntry, historyRange])
  const isSingleDayChart = chartData.length > 0 &&
    marketDateKey(new Date(chartData[0].time)) === marketDateKey(new Date(chartData[chartData.length - 1].time))

  const latestPrice = currentStock && Number.isFinite(currentStock.currentPrice) && currentStock.currentPrice > 0
    ? currentStock.currentPrice : null
  const priceChange = getPriceChange(matchedTransaction?.price ?? entry.priceSnapshot, latestPrice)
  const priceChangeLabel = entry.entryType === 'BUY' ? 'Price change since purchase'
    : entry.entryType === 'SELL' ? 'Price change since sale'
    : entry.entryType === 'REFLECTION' ? 'Price change since reflection' : 'Price change since entry'
  const recordedRange = useMemo(
    () => entry.entryType === 'BUY'
      ? getRecordedRangeSinceEntry(matchedTransaction?.timestamp ?? entry.timestamp, history) : null,
    [entry, matchedTransaction, history]
  )
  const realized = useMemo(
    () => entry.entryType === 'SELL' && matchedTransaction
      ? getRealizedPnLForSell(matchedTransaction, transactions) : null,
    [entry.entryType, matchedTransaction, transactions]
  )
  const valueColor = (value: number | null | undefined) =>
    value == null || value === 0 ? 'text-foreground' : value > 0 ? 'text-gain' : 'text-loss'

  const lineColor = getPriceHistoryColor(chartData)

  return (
    <div
      ref={containerRef}
      className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-elevated border-l border-border shadow-floating z-[1200] p-6 overflow-y-auto"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <h2 className="text-2xl font-130 m-0">{entry.ticker || 'Journal Entry'}</h2>
          <span
            className={journalBadge(entry.entryType)}
          >
            {JOURNAL_STYLES[entry.entryType].label}
          </span>
        </div>
        <button
          onClick={onClose}
          disabled={saving}
          className="px-3 py-1.5 bg-elevated text-foreground rounded-md hover:bg-surface-hover active:bg-surface-active transition-colors"
        >
          Close
        </button>
      </div>

      {/* Record */}
      <div className="mb-6">
        <div className="text-sm text-foreground mb-1">
          <span className="font-130">Date:</span>{' '}
          {new Date(entry.timestamp).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
          })}
          {' · '}
          <span className="font-130">Time:</span>{' '}
          {new Date(entry.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        </div>
        <div className="text-sm text-foreground mb-1">
          <span className="font-130">Snapshot:</span>{' '}
          {entry.priceSnapshot != null && entry.priceSnapshot > 0 ? formatCurrency(entry.priceSnapshot) : '—'}
          {(entry.entryType === 'BUY' || entry.entryType === 'SELL') && (
            <>
              {' · '}
              <span className="font-130">Shares:</span>{' '}
              {matchedTransaction ? matchedTransaction.shares : '-'}
              {' · '}
              <span className="font-130">Total:</span>{' '}
              {matchedTransaction ? formatCurrency(matchedTransaction.totalValue) : '-'}
            </>
          )}
        </div>
        {entry.entryType === 'REFLECTION' && entry.sourceEntryId != null && (
          <JournalSourceQuote source={sourceEntry} />
        )}
        <div className="text-sm text-foreground mt-3 whitespace-pre-wrap break-words">{entry.body}</div>
      </div>

      {error && <div className="text-error mb-4">{error}</div>}

      {/* Price History Chart */}
      {entry.ticker && (
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="text-lg font-130">Price History</h4>
            <PriceHistoryRangeSelector value={historyRange} onChange={setHistoryRange} />
          </div>
          {loading && chartData.length === 0 ? (
            <div className="text-muted">Loading chart...</div>
          ) : chartData.length === 0 ? (
            <div className="text-muted">{historyRange === 'all' ? 'No price history available.' : 'No price history available for this period.'}</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickCount={3}
                    tickFormatter={value => formatPriceHistoryDate(value, isSingleDayChart)}
                    stroke="var(--color-muted)" fontSize={12} tickLine={false}
                  />
                  <YAxis
                    stroke="var(--color-muted)"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                    domain={[(dataMin: number) => dataMin * 0.99, (dataMax: number) => dataMax * 1.01]}
                  />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div className="rounded-md border border-border bg-elevated px-3 py-2 text-sm text-foreground">
                      {formatPriceHistoryDate(Number(label))}{historyRange !== 'all' && ` · ${formatPriceHistoryDate(Number(label), true)}` }: {formatCurrency(Number(payload[0].value))}
                    </div>
                  ) : null} />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={lineColor}
                    strokeWidth={2}
                    dot={chartData.length === 1 ? { r: 3 } : false}
                    activeDot={{ r: 5 }}
                  />
                  {entry.entryType === 'REFLECTION' && sourceEntry?.priceSnapshot != null
                    && Number.isFinite(sourceEntry.priceSnapshot) && sourceEntry.priceSnapshot > 0
                    && chartData.some(point => point.time === Date.parse(sourceEntry.timestamp)) && (
                    <ReferenceDot
                      x={new Date(sourceEntry.timestamp).getTime()}
                      y={sourceEntry.priceSnapshot}
                      r={5}
                      fill={JOURNAL_STYLES[sourceEntry.entryType].color}
                      fillOpacity={0.65}
                      stroke="var(--color-foreground)"
                      strokeWidth={2}
                      ifOverflow="extendDomain"
                      aria-label="Original entry snapshot"
                    />
                  )}
                  {entry.priceSnapshot != null && Number.isFinite(entry.priceSnapshot) && entry.priceSnapshot > 0
                    && chartData.some(point => point.time === Date.parse(entry.timestamp)) && (
                    <ReferenceDot
                      x={new Date(entry.timestamp).getTime()}
                      y={entry.priceSnapshot}
                      r={6}
                      fill={JOURNAL_STYLES[entry.entryType].color}
                      stroke="var(--color-foreground)"
                      strokeWidth={2}
                      ifOverflow="extendDomain"
                      aria-label={entry.entryType === 'REFLECTION' ? 'Reflection snapshot' : 'Entry snapshot'}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {entry.entryType === 'REFLECTION' && (
        <div className="mb-6 p-4 bg-surface-hover rounded-lg border border-border">
          <h4 className="text-lg font-130 mb-3">Entry to reflection</h4>
          <div className="space-y-2">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted">Original snapshot</span>
              <span>{sourceEntry?.priceSnapshot != null && sourceEntry.priceSnapshot > 0 ? formatCurrency(sourceEntry.priceSnapshot) : '—'}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted">Reflection snapshot</span>
              <span>{entry.priceSnapshot != null && entry.priceSnapshot > 0 ? formatCurrency(entry.priceSnapshot) : '—'}</span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted">Price change</span>
              <span className={valueColor(comparison?.diff)}>
                {comparison ? formatSignedCurrencyWithPercent(comparison.diff, comparison.percent) : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Performance Section */}
      {entry.ticker && !loading && (
        <div className="mb-6 p-4 bg-surface-hover rounded-lg border border-border">
          <h4 className="text-lg font-130 mb-3">{entry.entryType === 'REFLECTION' ? 'Since reflection' : 'Performance'}</h4>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Latest price</span>
              <span className="text-foreground">{latestPrice == null ? '—' : formatCurrency(latestPrice)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">{priceChangeLabel}</span>
              <span className={valueColor(priceChange?.diff)}>
                {priceChange ? formatSignedCurrencyWithPercent(priceChange.diff, priceChange.percent) : '—'}
              </span>
            </div>
          </div>

          {entry.entryType === 'BUY' && (
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              {(['lowest', 'highest'] as const).map((key) => {
                const point = recordedRange?.[key]
                return (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted">{key === 'lowest' ? 'Lowest recorded price' : 'Highest recorded price'}</span>
                  <span className="text-foreground text-right">
                    {point ? formatCurrency(point.price) : '—'}
                    {point && <span className="block text-xs text-muted">
                      {new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>}
                  </span>
                </div>
                )
              })}
            </div>
          )}

          {entry.entryType === 'SELL' && (
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Realized gain/loss</span>
                <span className={valueColor(realized?.realizedPnL)}>
                  {realized
                    ? formatSignedCurrencyWithPercent(realized.realizedPnL, realized.realizedPercent)
                    : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-6">
        {!reflecting ? (
          <button onClick={() => setReflecting(true)} className="px-3 py-2 text-sm text-primary border border-border rounded-md hover:bg-surface-hover active:bg-surface-active transition-colors">
            Reflect on this entry
          </button>
        ) : (
          <form onSubmit={e => { e.preventDefault(); saveReflection() }}>
            <label htmlFor="reflection-body" className="block text-sm text-secondary mb-2">Your reflection</label>
            <textarea
              id="reflection-body"
              ref={reflectionInputRef}
              value={reflectionBody}
              onChange={e => setReflectionBody(e.target.value)}
              maxLength={2000}
              rows={4}
              disabled={saving}
              className="w-full p-3 bg-background border border-border-control rounded-md text-sm text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed"
            />
            {saveError && <div role="alert" className="text-error text-sm mt-2">{saveError}</div>}
            <div className="flex gap-2 mt-3">
              <button type="submit" disabled={saving || !reflectionBody.trim()} className="px-3 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary-hover active:bg-primary-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" disabled={saving} onClick={() => { setReflecting(false); setReflectionBody(''); setSaveError('') }} className="px-3 py-2 text-sm text-secondary rounded-md hover:bg-surface-hover active:bg-surface-active transition-colors disabled:bg-disabled-background disabled:text-disabled-foreground disabled:cursor-not-allowed">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Related Journal Entries */}
      {relatedEntries.length > 0 && (
        <div>
          <h4 className="text-lg font-130 mb-3">Related Journal Entries</h4>
          <div className="flex flex-col gap-3">
            {relatedEntries.map((relatedEntry) => (
              <div
                key={relatedEntry.id}
                onClick={() => { if (!saving) onEntryClick(relatedEntry) }}
                className="p-3 rounded-md transition-colors bg-surface border border-border cursor-pointer hover:bg-surface-hover active:bg-surface-active"
              >
                <div className="flex justify-between mb-1">
                  <span
                    className={journalBadge(relatedEntry.entryType)}
                  >
                    {JOURNAL_STYLES[relatedEntry.entryType].label}
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(relatedEntry.timestamp)}</span>
                </div>
                {relatedEntry.priceSnapshot != null && (
                  <div className="text-xs text-muted mb-1">
                    Snapshot: ${relatedEntry.priceSnapshot.toFixed(2)}
                  </div>
                )}
                <div className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">
                  {relatedEntry.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
