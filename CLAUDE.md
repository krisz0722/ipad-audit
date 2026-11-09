# Project conventions

## Documentation language

Setting: `both` (allowed values: `en`, `hu`, `both`).

- Primary: Hungarian, `README.md`.
- Secondary: English, `README.en.md`.
- When either file changes, update the other one in the same commit.

## Commits

- English only, conventional prefixes (`feat`, `fix`, `docs`, `chore`, `test`).
- No `Co-Authored-By` or other AI attribution lines.
- Author and committer email: the noreply address configured in this repository.

## Public repository rules

- Never commit real device data (serial numbers, UDIDs, IMEIs, MAC addresses) or personal email addresses. Use obviously fake values in tests.
- Never commit secrets or `.env` files.
- The seller page must only read the fixed list of fields in `web/parse.js`, and must only make a network request in `send()` in `web/seller.js`, after the seller's explicit consent. If you change what is read or sent, update the tables in both READMEs.
