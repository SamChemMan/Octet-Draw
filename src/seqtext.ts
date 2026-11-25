// Text that is a sequence (issue 27): Octet's words (peptide: ACD, dna: ATG) or HELM. Kept apart from helm.ts so the
// draw notation can tell it without loading the chemistry.
export const isSeqText = (text: string) => /^\s*(peptide|rna|dna)\s*:/i.test(text) || /^\s*(PEPTIDE|RNA|CHEM|BLOB)\d{1,9}\{/.test(text);
