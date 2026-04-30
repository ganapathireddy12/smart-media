import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
    errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo)
        this.setState({ error, errorInfo })
    }

    private handleReload = () => {
        window.location.reload()
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen bg-[#0c0c0c] text-white flex flex-col items-center justify-center p-6 text-center select-text">
                    <div className="bg-red-500/10 p-4 rounded-full mb-6">
                        <AlertTriangle size={48} className="text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
                    <p className="text-white/60 mb-8 max-w-md">
                        The application encountered an unexpected error.
                        We've logged this issue and it will be fixed in a future update.
                    </p>

                    <div className="bg-[#1c1c1c] border border-[#333] rounded-lg p-4 mb-8 w-full max-w-lg text-left overflow-auto max-h-[200px] scrollbar-thin">
                        <p className="font-mono text-red-400 text-xs break-all">
                            {this.state.error && this.state.error.toString()}
                        </p>
                        {this.state.errorInfo && (
                            <pre className="font-mono text-white/30 text-[10px] mt-2 whitespace-pre-wrap">
                                {this.state.errorInfo.componentStack}
                            </pre>
                        )}
                    </div>

                    <button
                        onClick={this.handleReload}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                        <RefreshCcw size={18} />
                        Reload Application
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
