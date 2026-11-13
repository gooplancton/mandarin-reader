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

## `body` — blocks

An array of blocks, in reading order:

```json
{ "type": "paragraph", "tokens": "…" }
```

- `type`: `"paragraph"` or `"heading"`. Unknown types are shown as paragraphs.
  Planned: `"dialogue"` (with `speaker`), `"image"`, `"break"`.
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
  "punct": false      // optional: force punctuation status (default: guessed — no letters or digits)
  // future, e.g.: "ruby": "yínháng", "ne": "place", "x-audio": [12.3, 12.9]
}
```

**Punctuation** tokens can't be "split" and count as boundaries on both sides.
The reader skips over them automatically.

## `dictionary`

Maps a dictionary key to an entry. Every non-punctuation token's key should have one;
the loader warns about missing ones.

```jsonc
"不起眼": {
  "py": "bù qǐyǎn",                   // pinyin with tone marks
  "en": ["inconspicuous", "unremarkable"],   // string or array of glosses
  "parts": ["不", "起眼"],             // optional: shown under the gloss
  "hsk": "6",                         // optional level tag
  "notes": "…"                        // optional free text
  // future: "trad", "zhuyin", "examples", "audio", "freq", other languages ("de", "es"…)
}
```

## Game rules

- The text is one long string of characters. Valid boundaries are every token
  start/end plus every soft boundary.
- Tapping the character at index *i* when *i + 1* is a valid boundary moves the
  read cursor to *i + 1*. Every word up to there is marked read and shown
  segmented, however many there are.
- Any other tap on unread text is a **slip**.
- Tapping text that's already read shows the dictionary entry.

## Bundling for `file://`

Browsers block `fetch()` on pages opened straight from disk, so
`node tools/bundle-texts.mjs` packs every `texts/*.json` into `texts/library.js`.
You can also load any file at runtime with **Open…**.
