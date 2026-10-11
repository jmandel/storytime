# Storytime: how to work on this repo

Storytime lets a reader (Grandma) read picture books live to a child (Cleo) over a video call. The child's side is
a phone on a stand that films the child holding the real book. The reader's side is one tablet page with the
video plus the current page's words in big type. It is a static site (GitHub Pages) with no server of its own.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `app.js` | the whole app: start screen, call, reader's book panel, child's book picker |
| `preview.html` | both sides side by side in one window, for looking at changes |
| `vendor/trystero-nostr.js` | Trystero 0.25.4 (Nostr strategy) bundled from `vendor-entry.js` |
| `books/` | the encrypted library: `index.bin` (book list with small covers) and one `<hash>.bin` per book |
| `tools/prep-pages.sh` | scan (PDF or photo folder) to `page-NN.jpg` |
| `tools/pack-books.mjs` | encrypt every book folder into `books/` |
| `tools/illustrate.sh` | draw an original book's pages with Codex |
| `tests/` | headless Chromium tests (`call.mjs`, `books.mjs`) and layout screenshots (`screens.mjs`) |

**Never committed:**
- `.env` (gitignored; copy `.env.example`): `STORYTIME_LIBRARY_KEY`, the key everything in `books/` is encrypted
  with; `STORYTIME_BOOKS`, the folder with the book sources; `STORYTIME_URL`, the local dev server for tests;
  `STORYTIME_DEV_URL`, the dev server's public HTTPS address for real devices. Tools and tests read it themselves.
- The book sources folder (`$STORYTIME_BOOKS`, outside the repo): one folder per book with `book.json` and its page
  images. They are scans of real books, so they must not be published unencrypted. The key must never be committed
  or pasted anywhere public.

## Links

Everything after `#` stays in the browser; GitHub never sees it.

    #lk=<library key>&reader=Grandma&child=Cleo            the parent's home link (bookmark it)
    #r=<room>&k=<call secret>&as=reader|child&lk=...&b=...  a call link (made by "Start a call")

| Setting | Meaning |
|---|---|
| `lk` | library key (`STORYTIME_LIBRARY_KEY` from `.env`); opens `books/` |
| `r`, `k` | room name and call secret, fresh for every call; `k` encrypts the call setup messages |
| `as` | `reader` (book panel) or `child` (phone on the stand) |
| `reader`, `child` | names shown in the app; neutral wording when absent |
| `b` | tonight's stack, `id,id,...`; the reader's tablet opens the first |
| `lib` | another folder or URL to load the encrypted books from |
| `relay` | `wss://...,wss://...` signaling relays instead of the default Nostr relays in `app.js` |
| `turn` | base64url of a JSON `iceServers` list, for networks that block direct calls |

Start screen settings (`lk`, names, `relay`, `turn`, `lib`) are copied into every call link.

The parent's phone saves those settings in localStorage the first time the home link is opened, so afterwards the
bare site address is enough (the key is not put back into the address bar). It also saves the last call (offered
as "Back to the call" / "Send link again" for 12 hours) and the last 8 books opened. The start screen's Settings
panel edits the names and connection settings, shares the home link to set up another device, and "Forget this
device" clears all of it. Call links themselves are never saved. The reader's tablet saves only recent books.

## Adding a book from a real one

1. **Scan.** Photograph each spread flat from straight above in good light, cover first, back cover last (or use a
   phone "scan to PDF"). One image per spread, in reading order.
2. **Make page images:** `tools/prep-pages.sh <scan.pdf | photo folder> $STORYTIME_BOOKS/<book-id>`
   (`<book-id>` is short kebab-case, e.g. `frog-and-toad-are-friends`). Look at every page: right order, upright,
   nothing cut off.
3. **Write `book.json`** in that folder. Read every page image yourself and type the words exactly as printed.
4. **Pack:** `npm run pack` (encrypts every book folder in `$STORYTIME_BOOKS` into `books/`)
5. **Check** it in the app (see Testing), then commit `books/` (see Deploying).

### book.json

```json
{
  "id": "frog-and-toad-are-friends",
  "title": "Frog and Toad Are Friends",
  "author": "Arnold Lobel",
  "tags": ["frog and toad", "bedtime"],
  "voices": {"Frog": "#7bd88f", "Toad": "#d9a35f"},
  "pages": [
    {"img": "page-00.jpg", "label": "Cover", "text": "Frog and Toad Are Friends\nby Arnold Lobel"},
    {"img": "page-01.jpg", "text": "..."},
    {"img": "page-12.jpg", "note": "Printed upside down: turn the book over!", "text": "..."},
    {"img": "page-14.jpg", "label": "Back cover", "text": "..."}
  ]
}
```

- `id` is stable forever: links, recent lists and the encrypted file name depend on it.
- `pages` is one entry per photographed spread, in book order. `label` defaults to `Page <n>` (the spread's
  position); set it for covers, and for chapter books set it to the printed page numbers (`"Pages 12-13"`).
- `note` is a short hint shown to the reader above the words (upside-down page, flap to lift, sing this one).
- `tags` (optional) are lowercase words search should find: series, author nickname (`boynton`), mood
  (`bedtime`), season (`halloween`).
- `voices` (optional) gives speakers fixed colors; others get colors from a default palette.

### Transcribing the words

- Copy the printed words exactly: spelling, capitals, punctuation, repetitions ("Waah! Waah! Waah!"). Never
  paraphrase, shorten or "fix" the text.
- Use `\n` where the printed text starts a new line or block, so the reader sees the rhythm of the page. Read the
  page in the order a reader would (usually top-left to bottom-right; follow the design when text curves or is
  split across the spread).
- Leave out text that is part of the pictures (signs, labels, sound effects drawn into the art) unless it is
  clearly meant to be read aloud.
- Covers: title and author/illustrator credit. Back cover: the blurb only if short and fun to read; skip prices,
  barcodes, publisher addresses, review quotes.
- When a word is unreadable in the photo, ask for a better photo of that page instead of guessing.

### Marking who is talking

Wrap dialogue in `[Speaker: ...]`; narration stays plain:

    [Frog: "Toad, Toad,"] shouted Frog, [Frog: "wake up. It is spring!"]
    [Toad: "Blah,"] said a voice from inside the house.

- Tag only words a character speaks aloud, quotation marks included, exactly as printed. The `said Frog` part
  stays plain narration.
- Use the same short speaker name every time (`Frog`, not `Frog the frog`). Add the speakers to `voices` when a
  book has recurring characters.
- Don't tag a speaker the text doesn't make clear; leave it plain.
- `[` and `]` are reserved for tags; if a book prints square brackets, use parentheses.

The reader's tablet shows each speaker in their color with a small name label when the speaker changes.

### Long pages (chapter books)

The reader's panel fits each page's words as large as they go (up to 64px), hides the page picture if that is
needed to stay readable, and scrolls below 22px with a "more" cue. Long pages work as they are; prefer `label`s that
match printed page numbers so "Pages 12-13" on the tablet matches the book in the child's hands.

## Making an original book with Codex

Work in `$STORYTIME_BOOKS/<book-id>/work/`.

1. Write the story first: about 10-12 spreads, very short lines, lots of repetition and sound words, a calm
   ending. Put the title in `title.txt`.
2. **Character sheet** `ref.png`: one Codex call describing each main character (front and side view, plain
   background, no text). Look at it; redo until right. It anchors every page.
3. **Mood board** `moodboard.png`: one Codex call with `-i ref.png` asking for labeled panels: color palette,
   typography (story lines, LOUD sound words, quiet words, title), 3:2 page layouts with text placement, the
   supporting cast, the setting. Codex may refine it several times (a few minutes); its drafts are saved under
   `~/.codex/generated_images/<session>/`.
4. **`pages.tsv`**: `NN<TAB>scene<TAB>words` per page, `00` = cover, words with ` | ` line breaks and styling notes
   in parentheses.
5. **Draw:** `tools/illustrate.sh $STORYTIME_BOOKS/<book-id>/work` (four at a time; existing pages are skipped,
   so delete a page to redraw it; pass page numbers to draw only those).
6. Check every page: characters on-model, words spelled exactly. Redraw bad ones.
7. Convert: `magick work/page-NN.png -strip -quality 84 page-NN.jpg`, write `book.json` (same words as
   `pages.tsv`, without the styling notes), pack.

Codex CLI notes: put `-i <images>` **after** the prompt (otherwise the prompt is taken as an image name), run with
`< /dev/null`, and run long batches in the background.

## Testing

Serve the folder locally and run the tests (Chromium with a fake camera; they use the public Nostr relays):

    npm run serve &                             # python3 -m http.server 8092 --bind 127.0.0.1
    npm test                                    # tests/call.mjs (connect, wrong secret refused), tests/books.mjs
                                                # (stack, book switching, page turns both ways), tests/setup.mjs
                                                # (saved setup, last call, settings, forget)
    STORYTIME_LIB=books-test/ node tests/books.mjs   # same with a big test library, if you made one
    node tests/screens.mjs                      # screenshots of every screen at six sizes -> tests/out/

After any layout change, look at the `tests/out/` screenshots for every size; don't assume. To try it on real
devices during development, expose the local server over HTTPS (camera access needs HTTPS), e.g. Tailscale
Funnel, and open `preview.html#lk=...` or the home link.

`books-test/` is a scratch library for tests (gitignored). Make one by packing a folder of throwaway book folders
with the same key: `node tools/pack-books.mjs <folder> books-test`.

## Deploying

The site is plain files, published by GitHub Pages from the default branch. Commit `books/` together with any app
change that needs it, run the tests, then push. Check before pushing that no book sources, page images,
`.env` or key values are in the commit (`git show --stat`; `git grep` for the key).

## Keys

- **Library key** (`STORYTIME_LIBRARY_KEY` in `.env`): created by the first `npm run pack` if empty. Anyone with a
  link containing `lk` can read every book that is online. To revoke old links: empty the value, repack (a new key is
  written to `.env`), commit `books/`, and give the parent a new home link.
- **Call secret** (`k`): new for every call, made in the browser; nothing to manage.

## Relays and fallbacks

Calls start through public Nostr relays (list in `app.js`; several are used at once and only one needs to work).
After that the video goes directly between the devices. To use our own relay, run a Nostr relay (or Trystero's
`@trystero-p2p/ws-relay` server, which needs the matching strategy bundle) and add `relay=wss://...` to the home
link. If two networks can't connect directly, add a TURN server with `turn=`.

## Rebuilding the Trystero bundle

    npm i
    npx esbuild vendor-entry.js --bundle --format=esm --minify --outfile=vendor/trystero-nostr.js

Pin exact versions in `package.json`; run the tests afterwards.
