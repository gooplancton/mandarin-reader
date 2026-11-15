# 断词 Mandarin Reader

A Chinese reading app. While you read, tap the **last character of each word**,
like ticking word boundaries with a pencil. Save the words you look up as
flashcards, together with the sentence you found them in.

**Live app:** https://gooplancton.github.io/mandarin-reader/. To install it,
use *Add to Home Screen* on iOS/Android, or the install icon in the address bar
in Chrome/Edge. It works offline.

## Sections

### 📚 My library
- Example texts and your own uploaded texts, with reading progress
  (Not started, 37% read, Finished).
- **Upload text**, or drop `.json` files anywhere on the page. The format is in
  [docs/FORMAT.md](docs/FORMAT.md); start from [`docs/template.json`](docs/template.json).
- Per-text menu: reset progress, remove an uploaded text.
- **Download backup / Restore backup**: a single JSON file with all your texts,
  progress and cards.

### 读 Read
- A correct tap marks everything up to that point as read. Each read word gets a
  bracket underneath (└──┘), and fades according to how much meaning it carries:
  content words stay vivid, particles and measure words fade.
- You can skip ahead: one tap at the end of a phrase reads every word before it.
  Only a tap **in the middle of a word** counts as a slip.
- The page scrolls by itself to keep your reading position at a comfortable height.
- Tap a word you've already read to see its pinyin, meanings and the sentence
  it's in, then **＋ Add to cards**. If the word already has a card, the button
  adds this sentence to that card instead.
- You get feedback as you go: praise for chunks of words, streak milestones,
  slip markers, and a summary at the end. The summary can add every word you
  split straight to your cards.

### 🗂 Cards
- One card per word: characters, pinyin, meanings, and up to 5 context
  sentences (quoted as they appeared, with the word highlighted, plus the title
  of the text).
- **Study**: the front shows the word and a context sentence. The answer adds
  pinyin (🔊 to hear it) and meanings. You grade each card *Again / Hard / Good / Easy*
  (keys 1–4, space to reveal). The scheduler is a variant of SM-2, Anki's
  algorithm. You can set how many new cards to introduce per day.
- Search by characters, pinyin (tone marks optional), meaning or sentence; delete
  cards or sentences.
- **Export**: a tab-separated file Anki can import (Hanzi, Pinyin, Meaning, Context, Source).

All data stays on the device (IndexedDB). Nothing is sent to a server.

## Development

No dependencies and no framework: plain ES modules served as static files.

```sh
node tools/build.mjs            # after changing ANY file: bundles texts, updates sw.js
python3 -m http.server 8000     # then open http://localhost:8000
```

Run `tools/build.mjs` before committing. It writes the file list and a content
hash into `sw.js`, and that hash is how installed copies notice a new version
(they show a *Reload* prompt).

```
index.html              app shell (all views) + tab bar
manifest.webmanifest    PWA manifest          sw.js   offline cache (generated list)
css/style.css           styles (light/dark)
js/main.js              router, tab badge, drag-and-drop, service worker registration
js/views/               library.js · read.js · cards.js · review.js
js/reader.js            segmentation game engine (cursor, boundaries, autoscroll, sentence context)
js/format.js            text format loader & validator
js/library.js           built-in + uploaded texts, progress
js/flashcards.js        cards, contexts, daily limits, Anki export
js/srs.js               spaced-repetition scheduler
js/db.js                IndexedDB storage, backup/restore, migration from the first prototype
texts/*.json            example texts (bundled into texts/library.js)
tools/build.mjs         build step
```
