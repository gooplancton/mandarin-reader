# Mandarin Reader (断词) — proof of concept

A Chinese reading game. While you read, tap the **last character of each word**,
like ticking word boundaries with a pencil.

- A correct tap marks everything up to that point as read. The read text is
  shown split into words.
- Each read word gets a bracket underneath (└──┘) marking where it starts and
  ends. Read words also fade according to how much meaning they carry: nouns,
  verbs, adjectives and idioms stay vivid, while particles, measure words and
  prepositions fade (driven by `pos` / `weight` in the text file).
- You can skip ahead: one tap at the end of a phrase reads every word before it.
  Only a tap **in the middle of a word** counts as a slip.
- The page scrolls by itself, so the place you're reading stays at a comfortable height.
- Tap any word you've already read to see its pinyin and meaning. A 🔊 button
  pronounces it if the browser supports speech.
- You get feedback as you go: praise for chunks of words, streak milestones,
  slip markers, and a summary at the end (accuracy, words per tap, speed, the
  words you split).
- Hint (💡), undo (↶ / Ctrl+Z), text size, and progress saved in the browser.

## Run it

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Texts

- `texts/xiangzi-shudian.json`: *巷子里的旧书店*, an original HSK 6-level essay
  (562 characters, 329 words, 206 dictionary entries).
- The text format is described in [docs/FORMAT.md](docs/FORMAT.md).
- After adding or editing a text, run `node tools/bundle-texts.mjs` so it shows
  up when the page is opened from disk. You can also load a file at any time
  with **Open…**.

## Layout

```
index.html          app shell
css/style.css       styles (light/dark)
js/format.js        format loader & validator (MRFormat)
js/reader.js        game engine: cursor, boundaries, rendering, autoscroll (MRReader)
js/app.js           UI glue: library, stats, word sheet, finish screen
texts/*.json        texts; texts/library.js is generated
tools/bundle-texts.mjs
```
