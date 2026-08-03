import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Catches render errors so a single bad component shows a recoverable message
 * instead of a blank white page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-app px-4 text-primary">
        <div className="w-full max-w-[440px] rounded-lg border border-border-default bg-surface p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-border-faint bg-app">
            <AlertTriangle size={20} className="text-warning" strokeWidth={1.5} />
          </div>

          <h1 className="mt-4 text-[17px] font-semibold">Something broke on this page</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            This is a bug in Jobly, not something you did. Reloading usually clears it.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-app p-3 text-left text-[11px] leading-relaxed text-error">
              {error.message}
            </pre>
          )}

          <div className="mt-5 flex justify-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-white transition-colors duration-[120ms] hover:bg-accent-hover"
            >
              <RefreshCw size={15} />
              Reload
            </button>
            <a
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-md border border-border-default px-4 text-[13px] font-medium text-secondary no-underline transition-colors duration-[120ms] hover:bg-overlay hover:text-primary"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }
}
