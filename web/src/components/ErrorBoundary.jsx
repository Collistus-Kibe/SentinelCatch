import React from 'react';

/**
 * Robust React Error Boundary.
 * Catches unhandled errors anywhere in the child component tree,
 * preventing blank/black screen crashes of death and allowing graceful recovery.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[SentinelCatch ErrorBoundary] Unhandled component exception:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.handleReset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            padding: '20px',
            margin: '16px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            color: '#f87171',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            maxWidth: '520px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '18px' }}>🛡️</span>
            <strong style={{ fontSize: '14px', color: '#ffffff' }}>
              {this.props.title || 'Component Recovered Gracefully'}
            </strong>
          </div>
          <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
            A rendering exception occurred in this panel. All other operational surveillance functions remain live and responsive.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '6px 14px',
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              transition: 'background 0.2s',
            }}
          >
            ↻ Retry / Reopen Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

