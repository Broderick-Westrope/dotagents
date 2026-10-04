# Ledger format

One markdown file, newest evidence merged in place. Themes are the unit, not individual corrections.

```markdown
# Correction ledger

Last mined: 2026-10-04 (sessions since 2026-05-29)
Mined individually: <session id> at 2026-10-04T18:02:11; <session id> at 2026-10-05T09:40:00

## <theme name>

- Rule: <one imperative sentence>
- Count: <total> (last seen <date>)
- Status: open | enforced | watching | wontfix
- Rung: <ladder rung chosen>
- Enforced by: <file path, lint name, hook, or "-">
- Evidence: <3 to 5 most recent quotes with date and session id>
```

Status meanings:

- **open**: nothing enforces it yet.
- **enforced**: a change shipped. Keep counting. A correction after the enforcement date means the rung was too low, so move it up a rung and reopen.
- **watching**: enforced, no repeats since. Drop to a single evidence line after two clean mining runs.
- **wontfix**: the user decided it's situational. Record why so the next run doesn't re-propose it.

Sort themes by count since the last enforcement change, highest first.
