import { Component, type ReactNode } from 'react'

export default class ApplicationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div role="alert" className="p-6 space-y-3">
        <p>Unable to open your workspace. Please reload to try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
        >
          Reload
        </button>
      </div>
    )
  }
}
