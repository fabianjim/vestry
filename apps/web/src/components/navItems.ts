import {
  HomeIcon,
  ChartPieIcon,
  DocumentCurrencyDollarIcon,
  BookOpenIcon,
  DocumentMagnifyingGlassIcon,
} from './icons'

export type NavItem = { path: string; label: string; phoneLabel?: string; icon: typeof HomeIcon }

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { path: '/analysis', label: 'Holdings', icon: ChartPieIcon },
  { path: '/transactions', label: 'Transactions', phoneLabel: 'Trades', icon: DocumentCurrencyDollarIcon },
  { path: '/journal', label: 'Journal', icon: BookOpenIcon },
]

// Shown only when hindsight is configured; an outage or empty budget keeps it visible.
const insightsItem: NavItem = { path: '/insights', label: 'Insights', icon: DocumentMagnifyingGlassIcon }

export function visibleNavItems(insightsAvailable: boolean): NavItem[] {
  return insightsAvailable ? [...navItems, insightsItem] : navItems
}
