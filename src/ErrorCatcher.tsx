import React from "react";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export default class ErrorCatcher extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: any) { console.error("App crashed:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{fontFamily:"system-ui,sans-serif",padding:20}}>
          <h1 style={{color:"#b00020"}}>App error</h1>
          <pre style={{whiteSpace:"pre-wrap",background:"#f9f2f4",padding:12,borderRadius:8,border:"1px solid #eee"}}>
{String(this.state.error && (this.state.error.stack || this.state.error.message))}
          </pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}
