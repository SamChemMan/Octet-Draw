// Whether a call's arguments fit a tool's schema as tools/list gives it, as a strict AI app checks a call before it
// sends it (types, enums, what is required, the closed top level): what is wrong, or nothing. For the checks.
export const strict = (schema: any, v: any, defs: any, at: string): string | undefined => {
  if (schema.$ref) return strict(defs[schema.$ref.slice("#/$defs/".length)], v, defs, at);
  if (schema.enum && !schema.enum.includes(v)) return `${at}: not in the enum`;
  if (schema.type === "array") return Array.isArray(v) ? v.map((x, i) => strict(schema.items ?? {}, x, defs, `${at}[${i}]`)).find(Boolean) : `${at}: not an array`;
  if (schema.type !== "object") return !schema.type || typeof v === (schema.type === "integer" ? "number" : schema.type) ? undefined : `${at}: not a ${schema.type}`;
  if (!v || typeof v !== "object" || Array.isArray(v)) return `${at}: not an object`;
  const missing = (schema.required ?? []).find((k: string) => !(k in v));
  if (missing) return `${at}: no ${missing}`;
  return Object.entries(v).map(([k, x]) => (schema.properties?.[k] ? strict(schema.properties[k], x, defs, `${at}.${k}`) : schema.additionalProperties === false ? `${at}: ${k} is not listed` : undefined)).find(Boolean);
};
