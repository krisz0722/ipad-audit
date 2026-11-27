# Handoff: continuing ipad-audit on another machine

Written 2026-11-27, on branch `main` at commit `900fff2` (clean, in sync with `origin/main`).

This file is a snapshot for a new agent session. It is not a spec: when it disagrees with the code or the READMEs, the code wins. Delete or replace it once the next session has picked it up.

## 1. What this project is

A tool for buying used iPads, iPhones and Macs. The seller runs a USB reader on a computer, then does browser tests on the device being sold. Results go to the buyer's private Google Sheet through an Apps Script backend, and one combined report is emailed to the buyer. The code is public so sellers can verify what is read and sent.

Where things live:

- `web/` and `src/web/`: the seller page. `web/seller.js` is built by concatenating `src/web/seller/*.js` (`scripts/build-web.js`). Edit `src/`, then rebuild, because a test checks the two stay identical.
- `web/parse.js`: the fixed list of fields the seller page reads.
- `backend/Code.gs`: the Google Apps Script receiver.
- `tool/ipad_audit/`: the Python USB reader, battery stress test and receiver (`pymobiledevice3`).
- `scripts/`: wrappers, including the battery monitor.
- `tests/`: Node tests (`npm test`), Python tests (`pytest`), Playwright e2e (`npm run e2e`).
- `docs/flows.md`, `docs/flows.en.md`, `docs/example-report.md`: generated or test-guarded documentation.

## 2. State at handoff

- Git: `main` is clean and pushed before this file. Latest tag is `v0.7.1`. Local and remote branch `1-stabilize-seller-pilot` exists and is 24 commits behind `main` with nothing ahead, so it is stale.
- Recent commits, newest first:
  - `900fff2` moved CI and Pages deploy from GitLab to GitHub (`.github/workflows/test.yml`), removed `.gitlab-ci.yml` and the GitLab links.
  - `9a7ffcc` added the lightweight battery temperature monitor (`scripts/battery-monitor.py`, `scripts/battery-monitor.sh`, `npm run monitor`).
  - `542a0b0` added the standalone battery stress test without backend (`npm run battery`, `--battery-only` in the reader).
- Tests, run on the day of this handoff: `npm test` 120 passed, `pytest` 93 passed. The last GitHub Actions run on `main` (workflow `test`) succeeded.
- Open GitHub issue: #2 "Hide hardware test start button after completion". Commit `7b717a1` touched the hardware start action; whether it fully closes the issue has not been checked.
- `web/version.json` in the repository is stale (it says `v2026.11.14.3`). The Pages workflow overwrites it at deploy time, so this is expected.

## 3. Background worth knowing

These findings came from a battery and heat investigation on a real iPad Air 2 (iOS 15.8.x, aftermarket battery) in an earlier session. The raw data is not in the repository.

- The older battery test read the device syslog (`OsTraceService`) every second to watch the physical buttons. That produced 800+ log messages per second and kept the iPad's `logd` and USB controller busy, which heated the device and distorted the measurement. The standalone monitor therefore reads only the `AppleARMPMUCharger` registry entry every few seconds, with no syslog and no audio queries.
- The A8X chip has no VP9 hardware decoder. YouTube 1080p 60fps video is decoded on the CPU, which alone explains stable temperatures around 38 to 39 °C. Hardware H.264 is far cheaper.
- Sustained high brightness plus video can draw more than a 1.5 A computer USB port supplies, so the battery drains while connected. A wall charger avoids that. When interpreting stress test results, check the charging source first.

## 4. Rules for this repository

From `CLAUDE.md` (read it in full):

- Documentation is bilingual: `README.md` (Hungarian, primary) and `README.en.md`. Change both in the same commit.
- Commit messages in English with conventional prefixes (`feat`, `fix`, `docs`, `chore`, `test`). No `Co-Authored-By` or other AI attribution lines. Use the repository's configured noreply author email.
- Public repository: never commit real device data (serial numbers, UDIDs, IMEIs, MAC addresses), personal email addresses, secrets or `.env` files. Test data must be obviously fake.
- The seller page must keep working on Safari 9.1 (iOS 9.3.5): ES5 only, no `fetch`, `TextEncoder`, arrow functions, or `let`/`const` without a fallback. `tests/es5.test.js` guards part of this.
- The seller page may only read the fields listed in `web/parse.js` and may only make a network request in `send()` in `web/seller.js`, after explicit seller consent. If what is read or sent changes, update the tables in both READMEs.

## 5. Setup on a new machine

Node 22 or newer and Python 3.12 were used. The `.venv` directory and `node_modules` are not in git.

```bash
npm install
```

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
```

Checks:

```bash
npm test
```

```bash
PYTHONPATH=tool .venv/bin/python -m pytest -q
```

Browser integration and e2e tests need Playwright browsers and are not part of the default CI run:

```bash
npm run test:integration
```

```bash
npm run e2e
```

Real USB work (reader, battery stress test, battery monitor) needs an iPad connected, trusted and unlocked, plus the `pymobiledevice3` dependency from `requirements.txt`. An agent without that hardware cannot verify those paths, only the unit tests around them.

## 6. Known open items

These come from the "Status" section of `README.en.md` and are still unverified on real devices:

1. The iPad file reader in the wizard relies on assumed field names (`Last_Value_CycleCount`, `MaximumCapacityPercent`) and still needs checking against a real file.
2. The `system_profiler` key names used by the Mac command need checking on a real Mac.
3. In-browser hardware test: touch, camera and microphone need checking on a real device. There is no headphone jack test yet.
4. The Safari-opening attempt on iOS 9 devices needs verification on real hardware.
5. The `OriginalBattery` log value does not prove battery authenticity. Do not present it as a verdict.

Housekeeping candidates, not started:

- Decide whether to delete the stale `1-stabilize-seller-pilot` branch (local and remote). Ask the owner first, it is a remote deletion.
- Check issue #2 against the current seller page behavior and close it or describe what is missing.

## 7. Resume prompt

Paste this into the new agent session:

```text
Continue work on the ipad-audit repository (a public tool for checking used iPads, iPhones and Macs before buying). Start by reading docs/HANDOFF.md, CLAUDE.md and README.en.md, then run npm test and the Python tests to confirm a green baseline.

Rules: English commit messages with conventional prefixes, no AI attribution lines, docs changes go into both README.md (Hungarian) and README.en.md, never commit real device data or secrets, the seller page must stay ES5 compatible for Safari 9.1, and network requests only happen in send() in web/seller.js after consent.

State: main is at 900fff2, clean, CI green, latest tag v0.7.1. One open issue (#2, hide hardware test start button after completion). The stale branch 1-stabilize-seller-pilot has not been deleted.

First action: ask me what to work on next. Candidates are checking issue #2 against the current seller page, or the real-device verification items listed in section 6 of docs/HANDOFF.md.
```
