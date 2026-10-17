import { Component, Fragment, type ReactNode } from "react";
import Editor from "./Editor";
import Gallery from "./Gallery";
import { Dialog } from "./Dialog";

// ?gallery, ?smiles=… or ?labels opens a renderer test page instead of the editor.
const params = new URLSearchParams(location.search);

// An error while the editor draws shows a message, not a blank window. Close opens the editor again.
class Guard extends Component<{ children: ReactNode }, { failed: boolean; key: number }> {
  state = { failed: false, key: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <Dialog title="Octet cannot show this drawing" onClose={() => this.setState((s) => ({ failed: false, key: s.key + 1 }))}>An error stopped the editor.</Dialog>;
    return <Fragment key={this.state.key}>{this.props.children}</Fragment>;
  }
}

export default function App() {
  if (params.has("gallery") || params.has("smiles") || params.has("labels"))
    return <Gallery smiles={params.get("smiles") ?? undefined} labels={params.has("labels")} />;
  return <Guard><Editor /></Guard>;
}
