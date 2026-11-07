# Storytime: how to work on this repo

Storytime lets a family read picture books together over a video call: Grandma reads from her tablet (the page's
picture and words in big type), Cleo holds the real book in front of a phone on a stand, and anyone else in the
family can join. A family shares one link that works any time; everyone in the call is equal and sees the same
page. It is a static site (GitHub Pages) with no server of its own. `DESIGN.md` has the design and its tracker.

## Layout

| Path | What it is |
|---|---|
| `src/` | the app, React 18 (built with esbuild into `app.js` + `app.css`, which are gitignored) |
| `src/components/Home.jsx` | welcome (start a family), the family's home (join the call, send the link, books, add a book), "Who's this?", settings |
| `src/components/Call.jsx` | join screen, the call (video grid, waiting with the family link), the shared book (`BookPanel` with `Page`, or the slim `BookBar`) |
| `src/components/AddBook.jsx` | adding (or changing) a book in the browser: photos, order, turn, words, title |
| `src/components/Library.jsx` | book browsing (read lately, all, search, collections) used everywhere |
| `src/lib/` | `family.js` (family key, derived room/secret/library key, the saved family and person), `call.js` (Trystero room, retries), `library.js` (hosted books + local ones), `localbooks.js` (IndexedDB), `share.js` (passing local books in calls), `store.js`, `links.js` |
| `index.html` | the page shell |
| `preview.html` | both sides side by side in one window, for looking at changes |
| `vendor/trystero-nostr.js` | Trystero 0.25.4 (Nostr strategy) bundled from `vendor-entry.js` |
| `books/` | the private library, encrypted: `index.bin` (book list with small covers) and one `<hash>.bin` per book |
| `books/public/` | public books, unencrypted: `index.json` and one `<id>.json` per book; anyone can read them |
| `tools/prep-pages.sh` | scan (PDF or photo folder) to `page-NN.jpg` |
| `tools/pack-books.mjs` | encrypt every book folder into `books/` |
| `tools/illustrate.sh` | draw an original book's pages with Codex |
| `tools/family.mjs` | `npm run family`: make the family key (once) and print the family link |
| `tools/unpack-book.mjs` | a book exported from the app (added in the browser) into a book folder |
| `tests/` | headless Chromium tests and layout screenshots (`screens.mjs`) |

**Never committed:**
- `.env` (gitignored; copy `.env.example`): `STORYTIME_FAMILY_KEY` (the family key; the books' encryption, the call
  and the family link all come from it), `STORYTIME_FAMILY_NAME`, `STORYTIME_SITE` (optional), `STORYTIME_BOOKS`
  (the folder with the book sources), `STORYTIME_URL` (the local dev server for tests), `STORYTIME_DEV_URL` (its
  public HTTPS address for real devices). Tools and tests read it themselves.
- The book sources folder (`$STORYTIME_BOOKS`, outside the repo): one folder per book with `book.json` and its page
  images. They are scans of real books, so they must not be published unencrypted. The key must never be committed
  or pasted anywhere public.

## The family link

Everything after `#` stays in the browser; GitHub never sees it.

    #f=<family key>&n=<family name>    the family link (npm run family prints ours; "Start a family" makes others)
    #call                              the family call
    #view=<book id>                    one book on its own, with a PDF download (bookmarkable)
    #add, #add=<id>                    add a book in the browser, or change one added there

| Setting (family link) | Meaning |
|---|---|
| `f` | the family key (32 random bytes, base64url). The call's room and secret and the library key are derived from it with HKDF-SHA256 (`src/lib/family.js`; `tools/env.mjs` derives the same for packing) |
| `n` | the family's name, shown at the top of home |
| `lib` | another site's `books/` folder to read the hosted books from (default: `books/` next to the page) |
| `relay` | `wss://...,wss://...` signaling relays instead of the default Nostr relays |
| `turn` | base64url of a JSON `iceServers` list, for networks that block direct calls |
| `room` | a separate call for the same family (tests use it so they never join the real call) |

Opening the family link saves the family on the device (localStorage `storytime-family`) and clears the address
bar; after that the bare address or a home-screen icon is enough. A link for a different family asks before
switching. The device asks once "Who's using this device?" (`storytime-me`: the name under its video, and a device
id); names seen in calls are offered. Settings changes the name, the family's name (on this device only) and the
connection settings, and removes the family from the device. The page moves itself to https (the site also answers
on plain http, where cameras don't work).

## The call

Everyone in the family room sees everyone else in a grid (`#grid`, one tile per person, with their name, showing
the whole picture: a phone on a stand sends a tall one, and cropping it loses the child or the book). This device's
own video is a small thumbnail at the start of the button bar, never over anyone else. There are no sides. "Join the call" on home goes straight in (the tap
allows sound); a freshly opened `#call` asks for one Join tap, so a reload never turns a camera on by itself.
Leaving (or Back, which asks "Leave the call?") goes home. The bar (`Control`, `src/components/Icon.jsx`): round icons
with their names under them, one row, never wrapping, lit when switched on: Mute, Camera (the others see the name
instead of a black picture; the hello carries `camOff`), Book (show or hide the page on this screen only), Leave,
then this screen's own small picture.

The open book is shared (`useSharedBook`): `{id, page, at, by}`; anyone can open a book or turn a page, every screen
follows, the newest change wins, and someone joining is sent what is open. Each screen chooses how much book to show
(`#bookToggle`): the page panel (`#book`: picture, words fitted large, arrows, page strip; the default at 820px and
wider) or the slim bar over the video (`#bookBar`: cover, title, page, arrows; tapping the title picks another
book). Hiding the page never leaves the shared book: the bar keeps following, and showing it again opens the
current page. On a tall phone the panel goes under the video. The words come first: `Page` fits them as large as they go; if that is
under a comfortable size it shrinks the picture (down to a strip that still shows which page it is) before making
the words smaller or scrolling. The page strip goes when the panel is short (container queries on `#book`). Split:
side by side when there is width (a tablet or phone sideways; the page up to half, 56% on a phone); stacked otherwise,
the page taking 52% on an upright tablet and 70% on a phone. On a narrow panel (under 480px) the title moves into
the page-turn row and tapping it opens the shelf. The shared book carries the page's printed label, so the slim bar
shows "Pages 162–163" like the page panel.

How screens find each other (`src/lib/call.js`): every screen says hello every 4 s (name, device id, when it joined,
foreground or not, whose video is reaching it). Screens that stop saying hello drop out of the grid. Another tab or
window of the same device: the newest one in the foreground keeps the call and the other shows "The call moved to
another window" with "Use this window" (`tests/tabs.mjs`). Cameras are sent one way at a time per pair (lower peer
id first), because two simultaneous renegotiations can collide and lose one direction.

Getting unstuck (`tests/recover.mjs`): every attempt to join loads a fresh copy of `vendor/trystero-nostr.js`
(`?copy=n`), so it gets new relay sockets and a new peer id, and the old copy is shut down. Rejoining with the old
copy doesn't work: relay sockets can die without closing (a frozen background tab), and the others ignore new offers
from a peer id they think is connected. A screen joins again: with someone there whose video hasn't arrived for 20 s,
or someone reporting 3 times that ours isn't arriving; with nobody there, every 45 s; right away when it comes back
from more than 10 s in the background, or the network comes back, unless everyone's video is arriving; when "Try
again" (after 30 s alone) is tapped. Never in the background; at most every 8 s. A camera that stops for good
reloads the page (and rejoins straight away).

Back moves around inside the app: screens drawn on top without changing the address (Settings, a collection's
contents, the in-call picker and shelf) each register with `useBackLayer(open, close)`, so Back closes the top one.
Any new overlay or sub-screen must do the same. Back is guarded (`src/lib/guard.js`): at home Back asks "Leave
Storytime?" (an extra history entry sits on top), and during a call "Leave the call?". Navigate with
`go`/`goReplace` from `src/lib/links.js`, never by setting `location.hash` directly.

## Books

Two kinds, on one shelf:
- **Hosted:** `books/` on the family's site, encrypted with the library key derived from the family key (public
  books unencrypted in `books/public/`). Prepared as below and pushed. Every device fetches them from the site.
- **Added in the browser** (`#add`): photos of the cover and each spread, put in order, turned upright, words
  optional (the reader can read them off the picture), a title. Kept on the device in IndexedDB (database
  `storytime`, filed under the family's room name), marked "added here", with Change / Export / Remove in the book
  view. During a call they are passed between the family's devices (`src/lib/share.js`): each device sends its list
  (`{have: [{id, at, deleted?}]}`), the other asks for what it lacks or has older (`{want}`) and gets whole books;
  removals travel in the list. Other tabs of a device hear about changes through a BroadcastChannel.
  "Export" downloads `<id>.storytime.json`; `node tools/unpack-book.mjs <file>` turns it into a book folder in
  `$STORYTIME_BOOKS`, to fix and pack like a scan (then remove the browser copy, or keep both).

## On a grandparent's tablet: home screen and Siri

Open the family link in Safari, then Share → Add to Home Screen ("Storytime", the ghost cub icon). For Siri, a
Shortcut with "Open URLs" and the family link, named e.g. "Storytime"; "Hey Siri, Storytime" opens it. Either way
they tap "Join the call". There is no service worker: a page that comes back to the front (and every half hour)
checks `app.js`'s ETag / Last-Modified and reloads when a new version is published, but not during a call
(`watchForUpdates` in `src/main.jsx`). Books always revalidate.

## A new family

- In the browser: "Start a family" on the welcome screen (family name, your name) makes a key; "Send the family
  link" shares it. Their shelf has the public books and the ones they add.
- With their own GitHub library: fork this repo, turn on Pages (GitHub Actions), `npm run family -- "Their name"`
  (makes `STORYTIME_FAMILY_KEY`, prints the link for their Pages site), add book folders, `npm run pack`, push.

## Adding a book from a real one

1. **Scan.** Photograph each spread flat from straight above in good light, cover first, back cover last (or use a
   phone "scan to PDF"). One image per spread, in reading order.
2. **Make page images:** `tools/prep-pages.sh <scan.pdf | photo folder> $STORYTIME_BOOKS/<book-id>`
   (`<book-id>` is short kebab-case, e.g. `frog-and-toad-are-friends`). Then look at every page image yourself and
   fix the scan; this is part of the job, not something to report back:
   - **Rotation.** A photo taken sideways or upside down: `magick page-NN.jpg -rotate 90 page-NN.jpg` (or `-90`,
     `180`), then look again to confirm it is upright (judge by the characters and the text, not the frame). Don't
     rotate a page the book itself prints upside down or sideways as a game; keep it as printed and add a `note`
     ("Printed upside down: turn the book over!").
   - **Order.** Pages out of order (scanned in the wrong sequence, the back cover first, a page missed and added at
     the end): rename the files so `page-00` ... `page-NN` follow the book (story text, printed page numbers and
     the art make the order clear). Rename through temporary names so nothing is overwritten.
   - **One image per spread.** Each page entry must match what the child sees with the book open: the whole
     two-page spread, with all of its words. If a spread was photographed as two halves (one page per photo, as
     phone scans of bigger books often are), join them side by side:
     `magick left.jpg right.jpg -resize x1600 +append -resize '2400x1600>' -quality 84 page-NN.jpg`
     and combine their words (left page first, a blank line between). Books printed with facing pages (chapter
     books, compendiums) are joined the same way: even page on the left (158|159, 160|161, ...; check which side
     the gutter or page border is on), labelled `"Pages 158–159"`. A half that is only a picture is the classic
     sign of a split spread; never leave a "no words" half next to a half with words.
   - **Duplicates and overlaps.** Delete a page photographed twice. When one photo shows a whole spread and another
     only half of it, build the spread from the best parts (crop the missing half out of the wider photo with
     `magick in.jpg -crop WxH+X+Y +repage out.jpg`, then join). When a photo also catches the edge of a
     neighbouring page, crop it off or keep it but transcribe only that page's own words.
   - **Leftovers.** Drop pages that aren't part of the story for the child: ads, order forms, printer's details
     (a back cover that is only an ad). Keep a back cover with a short blurb.
   - **Missing or unreadable.** If a page is missing, blurry, glared over or cut off so the words can't be read,
     say which one and ask for a re-shoot rather than guessing. A missing cover or back cover is fine.
   - **Then look at the result:** make a contact sheet (`magick montage page-*.jpg -tile 6x -geometry 300x220+4+4
     sheet.jpg`) and view it: every image upright, one per spread, in order, nothing left over.
   **If you can't find or fix something, say so** in your reply (which page, what is wrong, what you need), and
   still add the rest of the book. Don't silently leave a sideways page, a half spread or a guessed word.
   Tell the parent briefly what you fixed (e.g. "page 4 was sideways; I turned it").
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
- `public` (optional, `true`): pack the book unencrypted into `books/public/` so the app shows it to everyone,
  with or without a key. Only for books we have the right to publish (our own, like the Codex-illustrated ones);
  never for scans of published books.

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

### Collections (compendiums scanned a story at a time)

A big book of separate stories (a Frog and Toad treasury, a Boynton collection) is a **collection**: one card on the
shelf, opening to its contents, with each story packed as its own file so the book can grow one scan at a time.

    $STORYTIME_BOOKS/frog-and-toad/
      collection.json        {"id", "title", "author", "tags", "voices", "public"?}  (voices shared by every story)
      cover.jpg              optional: the book's front cover (otherwise the first story's first page is used)
      ice-cream/             one folder per story
        book.json            {"id": "ice-cream", "title": "Ice Cream", "pages": [...], "voices"?, "start"?}
        page-00.jpg ...

- A story's pages are spreads of facing pages labelled with the printed numbers (`"label": "Pages 158–159"`);
  stories are listed in order of their first printed page (or `"start"`), so they slot into place whatever order
  they are scanned in. A story that starts on a right-hand page starts with a single page (`"Page 157"`).
- The first page of a story is usually its title page: keep the story title as the first line of its text.
- A spread with only pictures (rare once facing pages are joined) gets `"text": ""` and `"note": "Picture page: no
  words"`.
- In the app a story's id is `<collection>/<story>`; it can be in tonight's stack, recent books and the pickers like
  any book, and its last page offers "Next story" in the collection.

**When a new scan arrives, check whether it belongs to a collection already in the library** before making a new
book. Signs: printed page numbers in the middle of a book (e.g. 158-169) instead of a cover; a story-title page;
the same characters, author, typeface, page borders or running heads as an existing collection's pages (look at a
page image from it). If it matches, say so and offer to add it ("This looks like another story from your Frog and
Toad book (pages 170-181) - add it there?"), then put it in a new story folder of that collection. If a scan of a
standalone book looks like it belongs with another standalone book from the same compendium, offer to turn them
into a collection. If you can't tell which book a story comes from, ask, and ask for a photo of the book's cover
for `cover.jpg` when the collection doesn't have one.

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

The reader's tablet shows each speaker's words in their color, and the speaker's name where the narration mentions
it ("said Frog", "cried a squirrel") in the same color. Put every speaker in `voices` (or the collection's
`voices`) so a name that only appears in narration on some page still gets its color.

### Auditing the library

When asked to audit (or after changing these rules), make a contact sheet of every book folder and check each one
against the list in step 2; fix what you can, repack, and report per book what you changed and what still needs a
re-shoot.

### Long pages (chapter books)

The reader's panel always shows the page picture at a steady height and fits the words as large as they go
(about a twelfth of the panel width, at most 64px); below 22px they scroll with a "more" cue. Long pages work as they are; prefer `label`s that
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
   `pages.tsv`, without the styling notes, and `"public": true` if it should be readable by everyone), pack.

Codex CLI notes: put `-i <images>` **after** the prompt (otherwise the prompt is taken as an image name), run with
`< /dev/null`, and run long batches in the background.

## Building

`npm run build` writes `app.js`, `app.css` and lazily loaded `chunks/` (minified, production React); `npm run dev` rebuilds on every change.
State lives in React (saved setup through `src/lib/store.js`'s `useStored`, so a change re-renders every screen that
uses it); screens switch by changing the hash, never by reloading the page. Keep element ids stable: the tests use
them.

## Testing

Build, serve the folder locally and run the tests (Chromium with a fake camera; they use the public Nostr relays):

    npm run serve &                             # python3 -m http.server 8092 --bind 127.0.0.1
    npm test                                    # family (start, link, who's this, settings), call (three people,
                                                # another family separate), books (shared book, both ways, joiner),
                                                # collections, public, viewer (+ PDF), addbook (add, order, turn,
                                                # words, export, passed in a call, changes, removal), back, tabs, recover
    STORYTIME_LIB=books-test/ node tests/books.mjs   # same with a big test library, if you made one
    node tests/screens.mjs [filter]             # screenshots on real device sizes (iPhone SE/15, Pixel, Pixel with
                                                # large text, iPad mini/iPad/Pro, laptops; upright and sideways),
                                                # with a tall picture from the child's phone -> tests/out/

After any layout change, look at the `tests/out/` screenshots for every device; don't assume. Check: the controls
fit on one line, the words of a short page fit without scrolling, the child's whole picture shows, nothing overlaps. To try it on real
devices during development, expose the local server over HTTPS (camera access needs HTTPS), e.g. Tailscale
Funnel, and open `preview.html#f=<family key>` (two people in one call) or the family link.

Tests that need our books use our family (`STORYTIME_FAMILY_KEY`) with a separate `room`, so they never join the real
call; the others use fresh families. `books-test/` is a scratch library (gitignored): `node tools/pack-books.mjs
<folder> books-test`, then `STORYTIME_LIB=books-test/`.

## Deploying

Pushing to `main` runs `.github/workflows/pages.yml`: `npm ci`, `npm run build`, then publishes `index.html`,
`preview.html`, `app.js`, `app.css`, the icons, `chunks/`, `vendor/` and `books/` to GitHub Pages. Commit `books/` together with any app change that
needs it, run the tests, then push. Check before pushing that no book sources, page images,
`.env` or key values are in the commit (`git show --stat`; `git grep` for the key).

## Keys

- **Family key** (`STORYTIME_FAMILY_KEY` in `.env`, made by `npm run family`): anyone with the family link is in the
  family: they can join the call and read every hosted book. To revoke old links: empty the value, `npm run family`
  (new key and link), `npm run pack`, commit `books/`, push, and send everyone the new link.
- Books added in the browser live on the family's devices only (never on the site).

## Relays and fallbacks

Calls start through public Nostr relays (`DEFAULT_RELAYS` in `src/lib/call.js`; several are used at once and only one
needs to work; a relay that refuses our messages, as offchain.pub started to, should be dropped).
After that the video goes directly between the devices. To use our own relay, run a Nostr relay (or Trystero's
`@trystero-p2p/ws-relay` server, which needs the matching strategy bundle) and add `relay=wss://...` to the home
link. If two networks can't connect directly, add a TURN server with `turn=`.

## Rebuilding the Trystero bundle

    npm i
    npx esbuild vendor-entry.js --bundle --format=esm --minify --outfile=vendor/trystero-nostr.js

Pin exact versions in `package.json`; run the tests afterwards. The bundle is served as its own file (the Pages
workflow copies `vendor/`), not bundled into `app.js`, so the call can load fresh copies of it.
