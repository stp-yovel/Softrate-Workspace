import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[LMS App Error Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    localStorage.removeItem('lms_auth_token');
    localStorage.removeItem('lms_auth_user');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-screen">
          <div className="error-boundary-card">
            <div className="error-boundary-icon" aria-hidden="true">!</div>
            <h2 className="error-boundary-title">
              The application encountered an unexpected error
            </h2>
            <p className="error-boundary-desc">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <div className="error-boundary-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={this.handleReset}
              >
                Clear State & Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
