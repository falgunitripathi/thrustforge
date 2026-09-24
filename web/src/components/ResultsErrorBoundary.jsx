import { Component } from "react";

/**
 * Last line of defence for the results column: if anything in it throws
 * while rendering, show a message instead of letting React unmount the
 * whole page (which leaves a blank screen). Clears itself when `resetKey`
 * changes — i.e. as soon as the user edits an input or switches engine.
 */
export default class ResultsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, key: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  componentDidCatch(error) {
    console.error("Results panel failed to render:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="error-banner">
        <span className="error-icon" aria-hidden="true">⚠️</span>
        <div>
          <strong>Something went wrong showing these results</strong>
          <p>
            One of the result panels couldn&rsquo;t be drawn for these settings. Change any input on the
            left, or press &ldquo;Reset to defaults&rdquo;, to try again.
          </p>
        </div>
      </div>
    );
  }
}
