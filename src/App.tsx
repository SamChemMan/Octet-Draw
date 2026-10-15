import Editor from "./Editor";
import Gallery from "./Gallery";

// ?gallery or ?smiles=… opens the renderer test page instead of the editor.
const params = new URLSearchParams(location.search);

export default function App() {
  if (params.has("gallery") || params.has("smiles")) return <Gallery smiles={params.get("smiles") ?? undefined} />;
  return <Editor />;
}
