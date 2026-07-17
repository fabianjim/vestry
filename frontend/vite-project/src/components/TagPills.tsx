import type { Tag } from '../types/journal'

interface TagPillsProps {
  tags: Tag[]
  onTagClick?: (tag: Tag) => void
  className?: string
}

export default function TagPills({ tags, onTagClick, className = '' }: TagPillsProps) {
  if (!tags.length) return null

  return (
    <div className={`flex flex-wrap gap-2 mt-2 ${className}`}>
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onTagClick?.(tag)}
          disabled={!onTagClick}
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity ${
            onTagClick ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
          }`}
          style={{
            backgroundColor: tag.color ? `${tag.color}25` : 'rgba(255, 255, 255, 0.1)',
            color: tag.color || '#bdbdbd',
            border: `1px solid ${tag.color ? `${tag.color}50` : 'rgba(255, 255, 255, 0.1)'}`,
          }}
        >
          #{tag.name}
        </button>
      ))}
    </div>
  )
}
