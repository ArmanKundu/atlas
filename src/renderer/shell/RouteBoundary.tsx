import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from '@/design/Button'
import { call } from '@/lib/ipc'
import { Mascot } from '@/mascot/Mascot'

interface Props {
  /** Short route name for the local log, e.g. "today". Never user content. */
  name: string
  children: ReactNode
}

interface State {
  failed: boolean
  /** Bumped on reload so the route remounts from scratch. */
  generation: number
}

/**
 * Error boundary around each route. A crash in one view never takes down the shell: the view is
 * replaced with a reload prompt and the error goes to the local log (`userData/logs`).
 */
export class RouteBoundary extends Component<Props, State> {
  override state: State = { failed: false, generation: 0 }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void call('log:rendererError', {
      scope: `route:${this.props.name}`.slice(0, 120),
      message: `${error.name}: ${error.message}`.slice(0, 2000),
      stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`.slice(0, 8000),
    }).catch(() => undefined)
  }

  private reload = (): void => {
    this.setState((state) => ({ failed: false, generation: state.generation + 1 }))
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <Mascot size={72} mood="concerned" interactive={false} />
          <div className="text-center">
            <p className="text-[0.9375rem] font-semibold text-ink">Something went wrong</p>
            <p className="mt-1 text-ink-2">
              This view hit a problem. Your data is safe. Reload the view to carry on.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={this.reload}
            icon={<RotateCw className="size-3.5" aria-hidden />}
          >
            Reload this view
          </Button>
        </div>
      )
    }
    return (
      <div key={this.state.generation} className="h-full">
        {this.props.children}
      </div>
    )
  }
}
