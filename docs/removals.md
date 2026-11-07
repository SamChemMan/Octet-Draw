# Removals

Each thing a release takes away from users, or makes worse, with the reason (decision 0023). The checks
(`src/inventory.check.ts`, `scripts/experience.mjs`) fail on anything lost unless a line here names its key in
backticks and says "Approved by Sam". The checks read only the lines under "Approved". Only Sam writes
those.

Format, one line each:

- `inventory:menu:<item>`: why it goes, and what users do instead. Approved by Sam, 1 January 2027.
- `experience:<scenario>:<rate>x:speed`: why it is slower, and when it will be fast again. Approved by Sam, 1 January 2027.

The keys are the ones the checks print.

## Approved

None yet.
