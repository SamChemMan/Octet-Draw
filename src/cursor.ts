// The Select cursor: an arrow with Phosphor's selection square beside it, drawn once at start-up.
// Cursors must be bitmaps to work everywhere, so the SVG is drawn to PNGs at 1x and 2x.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ArrowClockwise, Selection } from "@phosphor-icons/react";

// The glyph's path data, read from the real icon component (no copied paths).
function glyphPaths(icon: typeof Selection = Selection): string[] {
  const div = document.createElement("div");
  const root = createRoot(div);
  flushSync(() => root.render(createElement(icon, { size: 256, weight: "bold" })));
  const paths = [...div.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "");
  root.unmount();
  return paths;
}

// Canvas tokens: the cursor sits on the white canvas, so it uses the light theme's ink.
function lightInk() {
  const probe = document.createElement("div");
  probe.dataset.theme = "light";
  document.body.append(probe);
  const ink = getComputedStyle(probe).getPropertyValue("--ink").trim() || "#0F172A";
  probe.remove();
  return ink;
}

async function png(svg: string, scale: number): Promise<string> {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24 * scale;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

// A CSS cursor value, or "default" if drawing it fails.
export const selectCursor: Promise<string> = (async () => {
  const ink = lightInk(), d = glyphPaths();
  // White halos (wide white strokes underneath) keep the cursor visible over bonds.
  const glyph = (paint: string) => d.map((p) => `<path d="${p}" ${paint}/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M3 2v15l4-3.6 2.6 6 2.4-1-2.6-5.9H15z" fill="${ink}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/>
    <svg x="13" y="13" width="10" height="10" viewBox="0 0 256 256">
      <g fill="#fff" stroke="#fff" stroke-width="44" stroke-linejoin="round">${glyph("")}</g>
      <g fill="${ink}">${glyph("")}</g>
    </svg>
  </svg>`;
  try {
    const [one, two] = await Promise.all([png(svg, 1), png(svg, 2)]);
    return `-webkit-image-set(url("${one}") 1x, url("${two}") 2x) 3 2, default`;
  } catch {
    return "default";
  }
})();

// The Rotate cursor, over a selection's rotation handle: Phosphor's clockwise arrow, centred on the pointer.
export const rotateCursor: Promise<string> = (async () => {
  const ink = lightInk(), d = glyphPaths(ArrowClockwise);
  const glyph = d.map((p) => `<path d="${p}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <svg x="3" y="3" width="18" height="18" viewBox="0 0 256 256">
      <g fill="#fff" stroke="#fff" stroke-width="48" stroke-linejoin="round">${glyph}</g>
      <g fill="${ink}">${glyph}</g>
    </svg>
  </svg>`;
  try {
    const [one, two] = await Promise.all([png(svg, 1), png(svg, 2)]);
    return `-webkit-image-set(url("${one}") 1x, url("${two}") 2x) 12 12, grab`;
  } catch {
    return "grab";
  }
})();
