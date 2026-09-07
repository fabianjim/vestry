import { useState } from 'react'

type JournalPromptProps = {
  isOpen: boolean
  onClose: () => void
  onSubmit: (body: string) => void
  ticker: string
  tradeType: 'BUY' | 'SELL'
}

export default function JournalPrompt({ isOpen, onClose, onSubmit, ticker, tradeType }: JournalPromptProps) {
  const [body, setBody] = useState('')

  if (!isOpen) return null

  const handleSubmit = () => {
    onSubmit(body.trim())
    setBody('')
  }

  const handleClose = () => {
    setBody('')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-overlay flex justify-center items-center z-[1100]">
      <div className="bg-surface p-6 rounded-lg w-11/12 max-w-sm border border-border">
        <h3 className="text-xl font-150 mt-0 mb-2 text-foreground">
          Journal this {tradeType === 'BUY' ? 'purchase' : 'sale'}?
        </h3>
        <p className="text-muted mb-4">
          {ticker} — {tradeType}
        </p>
        <div className="mb-4">
          <label className="block mb-1 text-secondary">Note (optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Why did you make this trade?"
            rows={4}
            className="w-full px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={handleClose} className="px-3 py-2 bg-surface border border-border rounded-md hover:bg-surface-hover transition-colors">
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!body.trim()}
            className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            Save Entry
          </button>
        </div>
      </div>
    </div>
  )
}
