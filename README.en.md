# iPad and Mac condition check

[Magyar](README.md) | **English**

A tool for buying used iPads, iPhones and Macs. The buyer sends the seller a single-use link, the seller walks through a wizard on their own device, and the result goes to the buyer in one email.

The code is public so that the seller (and anyone else) can see exactly what the page reads and what it sends.

## For sellers: what does the page read?

| What we read | What we never read |
|---|---|
| battery cycle count and maximum capacity | passwords, Apple ID, email address, phone number |
| device type, storage size, system version | photos, messages, contacts, files |
| whether you are signed out of your Apple ID (you tell us) | installed apps, browsing data |
| on a Mac: Activation Lock state, managed by an organization yes/no | IMEI, device name, location, Wi-Fi networks, MAC addresses, UDID |
| a fingerprint of the serial number and its last 4 characters | the full serial number (only if the seller explicitly shares it) |

The seller sees everything in a preview first, and nothing leaves the device until they press **Send**. The preview is built by the same function as the payload that is sent, so the two cannot differ.

### How can you check this?

- [web/parse.js](web/parse.js): the readers. They only read a fixed list of fields and ignore everything else. The serial number fingerprint and the report structure are built here too.
- [web/seller.js](web/seller.js): the wizard. The only network request is in the `send()` function, after the Send button.
- [web/index.html](web/index.html): the page loads no third-party scripts, only its own files.
- [backend/Code.gs](backend/Code.gs): the receiving Google Apps Script. It accepts nothing without an invitation, stores only the code, label, expiry and status in the sheet, and delivers the result by email.

The deployed Apps Script cannot be verified from the outside, only the file in this repository can.

### How the serial number is handled

By default the report contains only the first 16 characters of `SHA-256(invite code + ":" + serial number)`. The invite code exists only with the seller and the buyer, so the serial number cannot be recovered from the email. On receipt the buyer can compute the same value from the device's serial number and confirm that the same device arrived.

## How does it work?

There are two modes:

1. **Seller wizard** ([web/](web/)): runs in the browser, nothing to install. On a Mac the seller pastes the output of a read-only Terminal command. On an iPad or iPhone the battery values come from Settings or from the system analytics file. The data is self-reported, so it is **not an authenticated measurement**.
2. **Receiving program** ([tool/](tool/), [web/receiver/](web/receiver/)): runs on the buyer's computer and reads the iPad over USB (`pymobiledevice3`). This is the authenticated measurement, because the data comes from the device itself, not from the seller's browser.

Data path in seller mode: browser, Google Apps Script, email to the buyer.

## Status

- The iPad file reader in the wizard relies on assumed field names (`Last_Value_CycleCount`, `MaximumCapacityPercent`) and still needs to be checked against a real file.
- The `system_profiler` key names used by the Mac command still need to be checked on a real Mac.
- The in-browser hardware test (camera, audio, touch) is not part of the seller wizard yet.
- The wizard targets Safari 9.1 (iOS 9.3.5) and newer, so it uses ES5 only, without `fetch` or `TextEncoder`. The iOS 9.3.5 menu names were checked on a real iPad, the names for other versions come from Apple's Hungarian pages and guides and still need checking on real devices.

## Development

Tests for the in-browser readers:

```
node --test tests/seller_parse.test.js
```

Local preview:

```
python3 -m http.server 8000 --directory web
```

The page then opens at `http://localhost:8000/`. Typing `DEMO` into the invite code field starts a trial mode: the Send button sends nothing and shows what would have been sent. The seller opens the plain address and types the 9-digit invite code on the first screen. A `#CODE` appended to the address only prefills the field.

Dependencies of the Python part: [requirements.txt](requirements.txt). Tests: [tests/test_core.py](tests/test_core.py).

## Setup

1. Create a Google Sheet, open Extensions > Apps Script, and paste the contents of [backend/Code.gs](backend/Code.gs) and [backend/appsscript.json](backend/appsscript.json).
2. Deploy it as a web app (execute as: you, access: anyone). Put the resulting `/exec` address into [web/config.js](web/config.js) and [tool/ipad_audit/config.py](tool/ipad_audit/config.py).
3. The "New invite" item of the sheet's "iPad audit" menu issues a single-use code that is valid for 72 hours.
4. [.gitlab-ci.yml](.gitlab-ci.yml) publishes the `web/` folder to GitLab Pages.

The `/exec` address is not a secret. Protection comes from the invite code and the daily mail limit.

## Reporting a security problem

If you find a bug or a privacy problem, open a confidential issue in the GitLab repository.

## License

[MIT](LICENSE)
