// The names of compound.ts's named transformations, apart from compound.ts so that the line notation (notation.ts)
// can tell a change from a SMILES ([Pd]) without loading Indigo.
export const NAMED = ["protect", "deprotect", "acetylate", "benzoylate", "form_carbonate", "esterify", "hydrolyse", "oxidise", "reduce", "hydrogenate", "epoxidise", "dihydroxylate", "hydroborate", "open_epoxide", "lactonise", "close", "open", "join"] as const;
// The ones that take with (a group, or another compound) and to (a bond order).
export const WITH = ["protect", "deprotect", "esterify", "hydroborate", "open_epoxide", "join"], TO = ["close", "join"];
