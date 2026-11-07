# Families: one link, everyone equal

A family shares one link, `…/storytime/#f=<family key>&n=<family name>`. It works any time, on any device, and
everything comes from the one key:

| Derived from the family key (HKDF-SHA256, `src/lib/family.js`) | Used for |
|---|---|
| `storytime room` (12 bytes) | the call's room name |
| `storytime call` (18 bytes) | the call secret (encrypts call setup) |
| `storytime library` (32 bytes) | the library key for the hosted `books/` (`npm run pack` derives the same) |

Opening the link once saves the family on the device (and clears the address bar). The device asks once for the
name of the person using it ("Who's this?"), shown on their video.

## The call

Everyone in the family room sees everyone else, in a grid; there are no sides. The open book is shared: anyone can
open a book or turn a page and every screen follows (latest change wins). Each screen chooses how much book to
show: the page panel (picture and words, the default on a tablet or laptop) or a slim bar (title, page, arrows; the
default on a phone on the stand).

Kept from the two-sided version: fresh Trystero copy per attempt, retries (nobody here: every 45 s; someone's
video missing: 20 s; back from the background; network back), cameras sent one way at a time per pair. A second
tab on the same device: the newest one keeps the call, the other steps aside.

## Books

- **Hosted** (`books/` on the family's site, encrypted with the derived library key; public books unencrypted).
  Prepared as before: scan, `tools/prep-pages.sh`, `book.json`, `npm run pack`, push.
- **Added in the browser** (photos of the pages, order, rotate, optional words), kept on the device (IndexedDB) and
  passed to other family devices during calls. Hosted books aren't passed around: every device can reach the site.
- A book added in the browser can be exported as `book.json` with its pages, to be polished and packed.

## A new family

- In the browser: "Start a family" makes a key and shows the link to share. Books: the public ones and the ones they
  add in the browser.
- With GitHub: fork the repo, turn on Pages, `npm run family` (makes the key, prints the link for their site),
  add books, `npm run pack`, push. The link on their own site needs no `lib=`; a link on another Storytime site can
  name the library with `lib=<url of books/>`.

## Tracker

- [x] Phase 1: family key + link, N-way call, shared book, start a family, `npm run family`, redesign
- [x] Phase 2: add a book in the browser (photos), IndexedDB, export (`tools/unpack-book.mjs`)
- [x] Phase 3: pass browser-added books between devices in calls
- [ ] Try on real devices: iPad (Safari + home screen), Android phone on the stand, three-way on home Wi-Fi
- [ ] Adding from a PDF in the browser (today: photos only; PDFs go through tools/prep-pages.sh)
- [ ] Later: who's in the call, shown on the home screen before joining; QR code for the family link
