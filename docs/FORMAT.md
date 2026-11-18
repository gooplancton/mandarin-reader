# Segmented-text format, version 1

A text is one UTF-8 JSON file (`*.json`). It holds the text, how it splits into
words, and a glossary for this text. The segmentation is written by hand, so it
fits the context: the same characters can split differently in different
sentences, which looking words up in one big dictionary can't handle.

```jsonc
{
  "format": "mandarin-reader/segmented-text",   // required, exact string
  "version": 1,                                  // required; readers accept same major version
  "meta": { ... },                               // about the text
  "body": [ ...blocks ],                         // the text itself
  "dictionary": { ...entries }                   // glosses, keyed by dictionary key
}
```

## Extending the format

- **Readers must ignore fields they don't know.** You can add new fields to any
  object (meta, block, token, dictionary entry) without changing the version.
  The reference loader keeps the original objects (`raw`), so later features can
  read them.
- Only raise `version` to **2** for a change that older readers would get wrong.
  A v1 reader refuses v2 files.
- Prefix experimental or app-specific fields with `x-`, e.g. `"x-audioOffset"`.

## `meta`

| field              | type                          | notes                                                      |
|--------------------|-------------------------------|------------------------------------------------------------|
| `id`               | string                        | Stable unique id. Progress is saved under it. Strongly recommended. |
| `title`            | string                        | Shown in the library.                                      |
| `titleTranslation` | string                        | optional                                                   |
| `language`         | BCP-47 string                 | `zh-Hans` (default) or `zh-Hant`                           |
| `level`            | `{ "system", "value" }`       | e.g. `{ "system": "HSK", "value": "6" }`                   |
| `author`, `source`, `license`, `tags` | any         | optional                                                   |
| `book`             | `{ "id", "title", "titleTranslation"?, "author"? }` | optional: the book this text is a chapter of (see below) |
| `chapter`          | `{ "number"?, "title"? }`     | optional: position and title of the chapter within its book |

### Books and chapters

A text file is always one chapter. Texts that share the same `meta.book.id` form
one book, which the library shows as a single card with a list of chapters.

```jsonc
"meta": {
  "id": "laoshe-chaguan-1",          // still unique per file: progress is saved per chapter
  "title": "第一幕",                  // the chapter's own title
  "book": { "id": "laoshe-chaguan", "title": "茶馆", "titleTranslation": "Teahouse", "author": "老舍" },
  "chapter": { "number": 1, "title": "第一幕" }
}
```

- `book.id` and `book.title` are required; `titleTranslation` and `author` are
  optional. The book's title, translation and author are taken from the
  lowest-numbered chapter that has them, so later chapters may give just
  `{ "id", "title" }`.
- `chapter.number` is the sort key and may be fractional (`2.5` slots a chapter
  in between). Chapters without a number come after the numbered ones, sorted
  by title. `chapter.title` defaults to `meta.title`.
- A malformed `book` or `chapter` (e.g. a string, or a book without `id`) gives
  a warning and is ignored; the text then loads as a standalone text.
  `chapter` without `book` has no effect.
- To add a whole book, select all its chapter files at once in **Upload text**
  (or drop them together). Example: [`examples/book-ch1.json`](examples/book-ch1.json)
  and [`examples/book-ch2.json`](examples/book-ch2.json).

## `body` — blocks

An array of blocks, in reading order:

```json
{ "type": "paragraph", "tokens": "…" }
```

- `type`: `"paragraph"`, `"heading"` or `"image"` (see [Image blocks](#image-blocks)).
  Unknown types are shown as paragraphs. Planned: `"dialogue"` (with `speaker`), `"break"`.
- `tokens`: the words of the block, in order. Give them as a **shorthand string**
  or as an **array**.

### Shorthand string (convenient for writing by hand)

Separate words with spaces. Chinese doesn't use spaces, so this can't clash with the text:

```
"在 这 座 熙熙攘攘 的 城市 里 ， 有 一 条 不·起眼 的 小 巷子 。"
```

Inside one word:

| mark | meaning | example |
|------|---------|---------|
| `·` (U+00B7) | **Soft boundary**: tapping here is also correct, e.g. for compounds that can sensibly be split. | `不·起眼`, `各种·各样` |
| `#…` suffix | **Dictionary key override**: picks a sense when the same characters need different entries. The display text is the part before `#`. | `行#hang`, `行#xing` → entries `"行#hang"`, `"行#xing"` |

### Token array (for anything richer)

Each item is either a shorthand string as above, or an object:

```jsonc
{
  "w": "银行",        // required: the text exactly as displayed
  "d": "银行",        // optional dictionary key (default: same as w)
  "soft": [1],        // optional: positions inside w (in characters) where a tap is also correct
  "punct": false,     // optional: force punctuation status (default: guessed — no letters or digits)
  "weight": 0.4       // optional: semantic weight for this occurrence (overrides the dictionary)
  // future, e.g.: "ruby": "yínháng", "ne": "place", "x-audio": [12.3, 12.9]
}
```

**Punctuation** tokens can't be "split" and count as boundaries on both sides.
The reader skips over them automatically.

### Image blocks

Texts can mix pictures with text, as social media posts do:

```jsonc
{
  "type": "image",
  "src": "https://example.org/pic.jpg",   // required, see below
  "alt": "A street food stall at night",  // required: what the picture shows (any language)
  "caption": "夜市 里 的 小吃摊",          // optional: same syntax as "tokens" (shorthand string or array)
  "credit": "Photo: Jane Doe, CC BY 4.0", // optional attribution, plain text, shown small
  "width": 1200, "height": 800            // optional intrinsic size in pixels
}
```

- `src` can be
  - an `https://` URL,
  - a `data:image/…` URI (keeps the file self-contained; fine for small pictures and SVG), or
  - a path relative to the text file, e.g. `images/stall.jpg`. This only works for
    built-in texts, which live in `texts/` (the path becomes `texts/images/stall.jpg`).
    An uploaded text has no folder, so use an https URL or a data: URI there.
- The **caption is part of the reading game**: its words are segmented, tapped and
  looked up like any other text, and count towards progress. It is its own block,
  so its sentences don't merge with the paragraph around it. Put its words in the
  dictionary too.
- `alt` and `credit` are not part of the game. `alt` is read by screen readers and
  shown if the picture can't be loaded.
- Give `width` and `height` when you know them: the reader then reserves the
  right amount of space before the picture arrives, so the text doesn't jump.
- Tapping a picture shows it full-screen. Pictures from other sites are kept in
  the app's offline cache once they've been shown.
- A missing or unusable `src`, or a missing `alt`, produces a warning; the block is
  then shown as a placeholder with its `alt` text (or skipped if there's nothing to show).
- Image blocks don't change the format version: an older reader treats one as an
  unknown block without `tokens` (a warning and an empty paragraph), and the rest
  of the text still reads correctly.

Example: [`docs/examples/social-post-images.json`](examples/social-post-images.json).

## `dictionary`

Maps a dictionary key to an entry. Every non-punctuation token's key should have one;
the loader warns about missing ones.

```jsonc
"不起眼": {
  "py": "bù qǐyǎn",                   // pinyin with tone marks
  "pos": "adj",                       // part of speech (see below)
  "weight": 0.55,                     // optional: semantic weight 0..1, overrides the POS default
  "en": ["inconspicuous", "unremarkable"],   // string or array of glosses
  "parts": ["不", "起眼"],             // optional: shown under the gloss
  "hsk": "6",                         // optional level tag
  "notes": "…"                        // optional free text
  // future: "trad", "zhuyin", "examples", "audio", "freq", other languages ("de", "es"…)
}
```

### Parts of speech and semantic weight

The reader fades function words in text that's already read, so content words
stand out. A word's weight (0–1) comes from, in order: the token's `weight`,
the entry's `weight`, the default for the entry's `pos`, and otherwise 1.

| `pos` | meaning | default weight |
|-------|---------|----------------|
| `n` `v` `adj` `idiom` `name` | noun, verb, adjective, chengyu/set phrase, proper name | 1 |
| `adv` `num` `pron` `time` `conj` `aux` | adverb, numeral, pronoun/determiner, time word, conjunction, modal | 0.6 |
| `prep` `loc` `comp` | preposition, locative (里, 上…), resultative/directional complement | 0.3 |
| `mw` | measure word | 0.25 |
| `part` | particle (的, 了, 着, 吗…) | 0.2 |

Use `weight` on an entry for words whose POS overstates them. For example, 是
and 有 are verbs but carry little meaning, so they get 0.55.

## Game rules

- The text is one long string of characters. Valid boundaries are every token
  start/end plus every soft boundary.
- Tapping the character at index *i* when *i + 1* is a valid boundary moves the
  read cursor to *i + 1*. Every word up to there is marked read and shown
  segmented, however many there are.
- Any other tap on unread text is a **slip**.
- Tapping text that's already read shows the dictionary entry.

## Built-in texts

Example texts live in `texts/*.json`. `node tools/build.mjs` bundles them into
`texts/library.js`, which the app imports. Users add their own texts with
**Upload text** in the library. Uploaded texts are validated and stored on the
device (IndexedDB).

## Making texts from raw Chinese

Converting a raw text (article, post, chapter) into this format is done with
the Claude Code skill [`.claude/skills/chinese-text-to-json`](../.claude/skills/chinese-text-to-json/SKILL.md):
segmentation and dictionary conventions (taken from `texts/xiangzi-shudian.json`),
meta/attribution, books and chapters, copyright. Check any file with

```sh
node tools/validate.mjs my-text.json [--source my-text.txt] [--strict]
```

`--source` checks that the tokens reproduce the raw text exactly. See
[`docs/examples/skill-demo.json`](examples/skill-demo.json) for a social-media example.
