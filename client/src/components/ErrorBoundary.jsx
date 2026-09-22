import { Component } from 'react';
import Button from './Button';

// Catches render errors in its subtree so a single broken item/member/page can
// never unmount the whole app. Logs the real error + component stack to the
// console so the root cause is visible, and renders a small fallback.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info && info.componentStack ? info.componentStack : '');
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="state">
          <p className="state__title">Something went wrong</p>
          <Button variant="secondary" size="sm" onClick={() => this.setState({ error: null })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}