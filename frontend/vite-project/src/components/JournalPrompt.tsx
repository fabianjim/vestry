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
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1100
    }}>
      <div style={{
        backgroundColor: '#d3d3d3',
        padding: 24,
        borderRadius: 8,
        width: '90%',
        maxWidth: 400
      }}>
        <h3 style={{ marginTop: 0, color: '#494949' }}>
          Journal this {tradeType === 'BUY' ? 'purchase' : 'sale'}?
        </h3>
        <p style={{ color: '#6c757d', marginTop: -8, marginBottom: 16 }}>
          {ticker} — {tradeType}
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, color: 'grey' }}>Note (optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Why did you make this trade?"
            rows={4}
            style={{
              width: '100%',
              padding: 8,
              boxSizing: 'border-box',
              fontSize: 14,
              resize: 'vertical'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={handleClose}>
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!body.trim()}
            style={{ backgroundColor: '#007bff', color: 'white' }}
          >
            Save Entry
          </button>
        </div>
      </div>
    </div>
  )
}
