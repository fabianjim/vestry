import { useState, useRef, useCallback, useEffect } from 'react'
import { journalApi } from '../services/api'
import { getActiveTagQuery } from '../utils/tagUtils'
import type { Tag } from '../types/journal'

interface TagInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
}

export default function TagInput({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
}: TagInputProps) {
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const debounceRef = useRef<number | null>(null)

  const fetchSuggestions = useCallback((query: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      try {
        const data = (await journalApi.getPopularTags(query)) as Tag[]
        setSuggestions(data || [])
        setSelectedIndex(0)
        setShowSuggestions(true)
      } catch {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 150)
  }, [])

  const getCursorCoordinates = (textarea: HTMLTextAreaElement, position: number) => {
    const style = window.getComputedStyle(textarea)
    const div = document.createElement('div')

    const stylesToCopy = [
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'boxSizing', 'whiteSpace', 'wordWrap', 'overflow',
    ]
    stylesToCopy.forEach((prop) => div.style.setProperty(prop, style.getPropertyValue(prop)))

    div.style.position = 'absolute'
    div.style.visibility = 'hidden'
    div.style.width = textarea.clientWidth + 'px'
    div.style.height = 'auto'
    div.style.whiteSpace = 'pre-wrap'
    div.style.wordWrap = 'break-word'

    const text = textarea.value.substring(0, position)
    const span = document.createElement('span')
    span.textContent = text
    div.appendChild(span)

    const marker = document.createElement('span')
    marker.textContent = '|'
    div.appendChild(marker)

    document.body.appendChild(div)
    const markerRect = marker.getBoundingClientRect()
    const textareaRect = textarea.getBoundingClientRect()
    document.body.removeChild(div)

    return {
      top: markerRect.top - textareaRect.top + textarea.scrollTop,
      left: markerRect.left - textareaRect.left,
    }
  }

  const checkSuggestions = useCallback((textarea: HTMLTextAreaElement, currentValue: string) => {
    const cursorPosition = textarea.selectionStart
    const { query, startIndex } = getActiveTagQuery(currentValue, cursorPosition)

    if (query !== null) {
      setPopupPosition(getCursorCoordinates(textarea, startIndex))
      fetchSuggestions(query)
    } else {
      setShowSuggestions(false)
    }
  }, [fetchSuggestions])

  const insertSuggestion = (suggestion: Tag) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPosition = textarea.selectionStart
    const { startIndex } = getActiveTagQuery(value, cursorPosition)
    if (startIndex === -1) return

    const before = value.substring(0, startIndex)
    const after = value.substring(cursorPosition)
    const newValue = `${before}#${suggestion.name} ${after}`
    onChange(newValue)

    window.setTimeout(() => {
      const newCursorPosition = startIndex + suggestion.name.length + 2
      textarea.setSelectionRange(newCursorPosition, newCursorPosition)
      textarea.focus()
    }, 0)

    setShowSuggestions(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    checkSuggestions(e.target, newValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertSuggestion(suggestions[selectedIndex])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    checkSuggestions(e.currentTarget, value)
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      checkSuggestions(e.currentTarget, value)
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    if (popupRef.current && showSuggestions) {
      const height = popupRef.current.offsetHeight
      setPopupPosition((prev) => ({ ...prev, top: prev.top - height - 8 }))
    }
  }, [showSuggestions, suggestions.length])

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onKeyUp={handleKeyUp}
        placeholder={placeholder}
        rows={rows}
        className={`w-full px-2 py-2 bg-surface-hover border border-border rounded-md text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={popupRef}
          className="absolute z-50 bg-surface border border-border rounded-md shadow-lg py-1 min-w-32"
          style={{ top: popupPosition.top, left: popupPosition.left }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => insertSuggestion(suggestion)}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                index === selectedIndex
                  ? 'bg-primary/20 text-primary'
                  : 'text-foreground hover:bg-surface-hover'
              }`}
            >
              #{suggestion.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
