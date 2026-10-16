import Editor from "./Editor";
import Gallery from "./Gallery";

// ?gallery, ?smiles=… or ?labels opens a renderer test page instead of the editor.
const params = new URLSearchParams(location.search);

export default function App() {
  if (params.has("gallery") || params.has("smiles") || params.has("labels"))
    return <Gallery smiles={params.get("smiles") ?? undefined} labels={params.has("labels")} />;
  return <Editor />;
}
