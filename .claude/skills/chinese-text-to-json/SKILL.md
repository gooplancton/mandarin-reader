---
name: chinese-text-to-json
description: Convert raw Chinese text (an article, a social-media post, a story, a book chapter…) into the Mandarin Reader segmented-text JSON format — word segmentation, per-text dictionary with pinyin/glosses/POS, meta, attribution, images — and validate it with tools/validate.mjs. Use whenever someone asks to segment or convert Chinese text for Mandarin Reader (断词), to add a text, book or chapter to the library (texts/), or to prepare a JSON file for upload.
---

# Chinese text → Mandarin Reader JSON

The reader is a game: the learner taps the **last character of every word**. So
segmentation is the product. It must be consistent, defensible to a learner, and
must reproduce the source text **exactly**. The spec is `docs/FORMAT.md`; the
reference text is `texts/xiangzi-shudian.json` (study it before your first
conversion: every rule below comes from it); `docs/template.json` is the
minimal skeleton; `docs/examples/skill-demo.json` (+ `.txt`) is a spoken-register
social-media example made with this skill (emoji, number, @mention, hashtag, image).

## 0. Decide where the result goes (copyright first)

| Content | Where | Notes |
|---|---|---|
| User wrote it / owns it, public domain, or an open license that allows redistribution and adaptation (CC0, CC-BY, CC-BY-SA, and CC-BY-NC / CC-BY-NC-SA while the app stays free and non-commercial) | built-in: `texts/<id>.json` | record `meta.source` + `meta.license` + `licenseUrl` + `modifications`; the app shows these as the credit line under the text. Share-alike (`-SA`) licenses: the JSON keeps the **same** license. Non-commercial (`-NC`): mention it to the user when you add the text. |
| `-ND` (no derivatives) licenses | **private upload only** | segmenting and glossing is an adaptation, which ND forbids |
| Anything else (news site, someone's Weibo/WeChat post, a modern novel…) | **private upload only**: write it outside `texts/`, e.g. `~/mandarin-reader-uploads/<id>.json` or a path the user names | tell the user it's for their own use via *Upload text* and must not be committed; `meta.license: "All rights reserved"` (or what you know) |

If you are unsure about the license, treat it as private. Never commit
copyrighted text to `texts/`, and never let `tools/build.mjs` bundle it.

## 1. Prepare the input

1. Save the cleaned raw text as `<id>.txt` in a scratch/working directory —
   **never in `texts/`** (the build bundles that folder). This file is what `--source` checks against, so it is the
   text **exactly as it will be shown**.
2. Clean up, but **keep the original wording**: remove page furniture (nav,
   "阅读原文", like/share counts, ads, timestamps lines), URLs, and broken
   characters. Don't fix the author's grammar, don't "simplify" vocabulary,
   don't drop sentences. If you abridge, say so in `meta.notes` (free field).
3. Keep paragraphing: one source paragraph = one `paragraph` block. Section
   titles inside the text = `heading` blocks. The text's own title goes in
   `meta.title` (the reader shows it in its header); add it as a first `heading`
   block only if you also put it as the first line of the `.txt`, so `--source`
   still matches. Either is fine — be consistent within a book. Very long paragraphs (> ~400 chars) may be
   split at a sentence end.
4. Script: keep the source script. Convert Traditional→Simplified only if the
   user asks (or the target learner needs it), then set `"language": "zh-Hans"`
   and record it, e.g. `"x-converted": "zh-Hant → zh-Hans"`. Unconverted
   Traditional text uses `"language": "zh-Hant"`.
5. Normalise punctuation width only where the source is inconsistent (Chinese
   text uses full-width `，。！？：；“”`; keep `……` and `——` as in the source).
6. Footnote markers / reference numbers (`…Drafting 1`, `[2]`) with no
   footnote text: keep them verbatim as `{ "w": "1", "punct": true }` tokens so
   they aren't tappable words; drop them only if you say so in `meta.notes`.
7. Images: put each where it appears, as a line `![alt](src)` in the `.txt`,
   followed by its caption on the next line (if any). The validator ignores the
   `![…](…)` line and checks the caption as text.

## 2. Segment

Write tokens in the **shorthand string**: words separated by single spaces.
Work paragraph by paragraph; read the whole sentence before cutting it.

### Core rules (from the reference text)

| Case | Rule | Examples |
|---|---|---|
| Particles 的 了 着 过 地 得 吗 呢 吧 啊 | always separate | `老人 的`, `笑 了 笑`, `藏 着`, `匆匆忙忙 地`, `多 得 多`, `还 好 吗` |
| Numbers + measure words | number / demonstrative / 每 / 几 separate from the measure word | `一 本`, `这 家`, `两 个`, `每 本`, `几 页`, `一 位`, `年 过 七十` |
| Numbers | one token per number word | `七十`, `一百`, `第一`, `6.5` |
| Fused demonstratives | lexicalized forms stay whole | `这个`, `那些`, `这里`, `多少` |
| Resultative / directional complements | one token with a **soft** boundary | `读·完`, `搬·走`, `传·开`, `装·进`, `骗·出来`, `睡·着` |
| … but fully lexicalized ones | one token, no soft | `走进`, `学会`, `发现` |
| V + 到/在 + place | 到/在 separate (prep) | `搬 到 了 这里`, `写 在 扉页 上`, `跳 到 沙发 上` |
| Separable VO compounds | one token; soft boundary if a learner might split it | `赚钱`, `搬家`, `读书`, `出门`, `回家`; `聊聊·天`, `生·闷气` |
| VO with something inserted | complement+verb is one token, object separate | `打·完 针`, `读·完 一 本 书` |
| Reduplication | AA / AABB = one token; `V了V` = three tokens | `淡淡`, `匆匆忙忙`, `认认真真`; `笑 了 笑`, `看 了 看` |
| A-not-A questions | three tokens | `乖 不 乖`, `是 不 是` |
| Negation | 不/没 separate from verbs/adjectives, **except** lexicalized words | `不 应该`, `不 出来`, `没 发生`; but `不是`, `没有`, `不再`, `不如`, `没·想到`, `没·用`, `不·起眼` |
| Lexicalized multi-morpheme words | one token | `越来越`, `一会儿`, `有时候`, `有点儿`, `一直`, `为了`, `可是`, `而是`, `据说`, `看似` |
| Chengyu and four-character set phrases | one token, never soft | `熙熙攘攘`, `琳琅满目`, `不知所措`, `不知不觉` |
| … that are two clear halves | one token with soft middle | `各种·各样` |
| Locatives (里 上 中 下 前 后 时) | separate from the noun | `店 里`, `扉页 上`, `过程 中`, `出门 前`, `年轻 时` |
| Lexicalized place/locative nouns | one token | `网上`, `深处`, `上面`, `底下`, `门口` |
| Fixed noun + 里/中/上 used as one word | one token with soft boundary | `心·里`, `心·中`, `家·里`, `手·上` (but `店 里`, `书架 上`: free locatives stay separate) |
| Potential complements | V 得/不 C = three tokens; the affirmative resultative stays one soft token | `记 不 起来`, `发挥 不 出`, `听 得 懂`; `发挥·出来`, `想·起来` |
| Compound nouns | one token; soft boundary where a learner sees two words | `书店`, `天花板`, `纸箱`; `收银·机`, `小鱼·干`, `铲屎·官` |
| Short fixed verb phrases | one token, soft at each morpheme | `静·下·心·来` |
| Adjective + noun (free) | separate | `旧 书店`, `小 巷子`, `木 招牌` |
| Proper names | one token (person, place, shop, pet, brand) | `馒头`, `小林`; quoted name `“ 慢·读 ”` |
| Pronoun + 们 | one token | `我们`, `人们` |

**Where to put `·` (soft boundaries):** inside a token, at a point where a
reasonable learner might tap because both sides are real words they know
(读·完, 收银·机, 没·想到). Don't add soft boundaries inside single
morphemes (`巷子`, `招牌`), chengyu, or words whose parts are meaningless alone.
If you're hesitating between "one token" and "two tokens", one token with a soft
boundary is usually the answer — it accepts both taps.

**When to use `#sense`:** the same characters appear in this text with
**different readings or clearly different meanings** that deserve separate
entries/flashcards: `得#de` (particle) vs `得#dei` (must), `行#hang` / `行#xing`,
`还#hai` / `还#huan`, `长#chang` / `长#zhang`, `了#le` / `了#liao`. Use the
toneless pinyin as the sense tag (or a short English tag if readings are
equal: `花#spend` / `花#flower`). Once a word has senses, **every** occurrence
gets one (no bare `得` entry alongside `得#de`). Small grammatical uses with the
same reading are extra glosses instead (`一`: "one", "(一…就: as soon as)").

### Punctuation

- Every punctuation mark is its own token: `，` `。` `“` `”` `：` `？` …
  Consecutive marks are separate tokens: `。 ”`, `： “`.
- Multi-character marks stay one token: `……`, `——`.
- Corner quotes `「」『』` and book-title marks `《》` are punctuation tokens
  like `“”`; the title inside `《…》` is segmented normally (a work's name may be
  one `name` token with soft boundaries: `《 风暴·英雄 》`).
- Never glue punctuation to a word (`书。` is an error).

### Social media & mixed script

| Thing | Rule | Example |
|---|---|---|
| Emoji / emoticons | keep them; each emoji (or a run of identical ones) is a token; they count as punctuation automatically. Keycap emoji with digits (`1️⃣`) need `{ "w": "1️⃣", "punct": true }` | `了 😂 出门` |
| Kaomoji like `(＾▽＾)` | one token, `{ "w": "…", "punct": true }` if it contains letters | |
| Arabic numbers | one token incl. decimal point / `%`; unit word separate; entry `py` = Chinese reading, `pos: num` | `6.5 公斤`, `50%` → `"py": "bǎi fēn zhī wǔshí"` |
| Dates/times in digits | one token per number, units separate | `3 月 15 号`, `8:30` |
| Latin words / brands / acronyms | one token per word, entry with `en` gloss; `py` optional (how Chinese speakers say it if well known) | `iPhone`, `WiFi`, `KTV` |
| Multi-word Latin phrase | object form keeps the space: `{ "w": "New York" }` (only allowed for tokens without Han) | |
| @mentions | `@` is a punctuation token; the handle is **one** `name` token (Han or Latin), gloss "(username)" | `@ 小林` |
| Hashtags `#话题#` | `#` marks are punctuation tokens; the tag text is segmented normally | `# 铲屎·官 日常 #` |
| URLs | remove in cleanup (mention them in `meta.source.url` if it's the source) | |
| Literal `·` or `#` inside a word (foreign names 达·芬奇, C#) | object form, since shorthand would read them as markup: `{ "w": "达·芬奇" }` | |

## 3. Dictionary

Collect the **set of unique keys** from your tokens (token text, or `text#sense`),
then write one entry per key, in order of first appearance. One entry per key —
not per occurrence — so its gloss must cover every use **in this text**.

```jsonc
"读完": { "py": "dúwán", "pos": "v", "en": ["to finish reading"], "parts": ["读", "完"] }
```

- **`py`** — Hanyu Pinyin with tone marks, syllables of one word written
  together, lowercase (capitalize names: `"Xiǎo Lín"`). House style, as in the
  reference text:
  - **dictionary citation tones, no third-tone sandhi** (`可以 kěyǐ`, `老鼠 lǎoshǔ`);
  - **一 always `yī`** in its citation tone (`一直 yīzhí`, `一会儿 yīhuìr`, `一样 yīyàng`, `一百 yībǎi`);
  - **不 is `bú` before a 4th tone inside a word** (`不是 búshì`, `不再 búzài`), `bù` otherwise (`不如 bùrú`, `不知所措 bùzhī suǒcuò`); a standalone `不` token is `bù`;
  - **neutral tone unmarked**, as the dictionary has it: `de le zhe ma`, `shíhou`, `zhāopai`, `xiāoxi`, aspect `过 guo`, reduplicated verbs `聊聊 liáoliao`, directional complements `骗出来 piàn chūlai`, `过去 guòqu`;
  - **儿化** as a final `r`: `一会儿 yīhuìr`, `有点儿 yǒudiǎnr`;
  - spaces only between the parts of a longer phrase: `bù qǐyǎn`, `gèzhǒng gèyàng`, `jìng xià xīn lái`.
- **`en`** — array of short glosses, **the meaning in this text first**, then
  1–2 other common senses at most. Grammar words get a parenthesized function
  description: `"(possessive / attributive particle)"`, `"(measure word for books)"`.
  For constructions, show the frame: `"(怎么…都: no matter how)"`.
- **`pos`** — exactly one of `n v adj idiom name adv num pron time conj aux
  prep loc comp mw part` (weights in FORMAT.md). Conventions: chengyu & set
  phrases `idiom`; demonstratives / 每 / question words `pron`; 会 要 可以 应该 得(děi) `aux`;
  在 把 比 用 从 给 到 为了 `prep`; 里 上 中 时 前 `loc`; standalone directional
  complement after another word (`赶 了 过去`) `comp`; modal particles &
  interjections (啊 吧 呢 哈哈 嗯) `part`; time nouns (现在 以后 去年 每天) `time`.
- **`weight`** — only to correct the POS default: light verbs `是 有 没有 不是` → `0.55`.
  Leave everything else to the POS default.
- **`parts`** — required when the token has soft boundaries; must join to the
  key's text and split exactly at the soft positions (`静·下·心·来` → `["静","下","心","来"]`).
- **`hsk`** — `"5"` or `"6"` only for words you're reasonably sure are on those
  lists (the reference tags 熙熙攘攘, 琳琅满目, 弥漫, 在于, 心态, 神情…). Don't guess lower levels.
- **`notes`** — sparingly: literal meaning of a name (`"馒头 = steamed bun"`),
  a surprising reading (`"着 here is zháo"`), slang/register (`"internet slang"`).

## 4. Meta

```jsonc
"meta": {
  "id": "laoshe-luotuo-xiangzi-3",      // slug: a-z 0-9 single hyphens; pinyin w/o tones or English
  "title": "骆驼祥子 · 第三章",           // original title (or first line if untitled)
  "titleTranslation": "Rickshaw Boy, Chapter 3",
  "language": "zh-Hans",
  "level": { "system": "HSK", "value": "5" },
  "author": "老舍 (Lao She)",
  "source": { "url": "https://…", "name": "Wikisource", "author": "老舍",
              "published": "1937-01-01", "retrieved": "2026-11-18" },
  "license": "Public domain",           // SPDX id when there is one: CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0
  "licenseUrl": "https://…",            // always for CC licenses
  "modifications": "Segmented into words and glossed for Mandarin Reader; text otherwise unchanged.",
  "tags": ["novel", "Beijing", "1930s"],
  "book": { "id": "laoshe-luotuo-xiangzi", "title": "骆驼祥子", "titleTranslation": "Rickshaw Boy", "author": "老舍" },
  "chapter": { "number": 3, "title": "第三章" }
}
```

- **id**: stable and unique — progress is saved under it, never change it after
  publishing. Built-ins: must equal the filename (`texts/<id>.json`).
- **level** (HSK 1–6, rough): HSK 1–2 = short sentences, everyday words, almost
  no 4-character expressions; 3–4 = connectors (虽然…但是, 因为…所以), some
  abstract nouns; 5 = written-register words (据说, 而, 便), some chengyu;
  6 = dense chengyu, literary 与其/在于/急于, abstract essays. Spoken posts are
  usually 3–4 even when they use slang. Pick the level a learner needs to read
  it comfortably with the glossary.
- **source/license**: fill what you know; `retrieved` = today. Original texts
  written for the app: `"author": "Mandarin Reader (original text)"`,
  `"license": "CC0-1.0"`. Third-party texts: `modifications` is required by CC
  licenses (state what you changed; mention any abridgement).
- **tags**: genre + topic + register, lowercase English (`essay`, `social media`, `news`, `spoken`).

### Books and chapters

For a long work, write **one file per chapter**: all share `meta.book`
(same `id`, `title`…); each has its own `meta.id = "<book-id>-<n>"` and
`meta.chapter.number = n` (the sort key). Aim for **~500–2500 characters per
file**: keep real chapters if they fit, split long ones at scene breaks or
paragraph boundaries into `n`, `n+1`… (give them `chapter.title` like
`"第三章（上）"`), merge very short ones. Keep the dictionary consistent across
chapters: copy entries from earlier chapters for reused keys (same `py`,
`pos`, first gloss) and only adjust glosses for new contexts.

## 5. Validate — mandatory loop

```sh
node tools/validate.mjs <file>.json --source <file>.txt
```

Fix every **error**, then every **warning** you can (or justify it to the user),
re-run, repeat until `✓ … 0 error(s)`. Then run once with `--strict` — a
clean strict run is the target for anything going into `texts/`. What it checks:
format/version, meta (id slug, book/chapter shapes, source dates, license),
image blocks (src scheme, alt), missing/unused/duplicate-looking entries,
punctuation glued to words, whitespace in tokens, soft positions, `parts`,
pinyin (tone marks, syllable count vs characters incl. 儿化, 一/不 house
style), `pos` set, weights, and with `--source` the exact text (the first
mismatch is shown with context — usually a dropped/duplicated character or a
token typed wrong).

Then, for built-ins only:

```sh
node tools/build.mjs     # bundles texts/*.json into texts/library.js, updates sw.js
```

and open the app (`python3 -m http.server 8000`) to read a paragraph if you can.

## 6. Self-review checklist

- [ ] Validator clean (`--source`, then `--strict`).
- [ ] Spot-check 3 random sentences: would a learner agree with each cut? Same
      construction segmented the same way everywhere (grep the token string for
      `的`, `了`, numbers + measure words, 不/没 forms)?
- [ ] Chengyu/set phrases single tokens; complements soft; particles separate.
- [ ] Every `#sense` used consistently; no bare key next to a sensed key.
- [ ] Glosses fit this context (first gloss), grammar words described, not translated.
- [ ] Pinyin: neutral tones, 一 yī, 不 bú before 4th tone, 儿 as r.
- [ ] `hsk` only where sure; `weight` only on light verbs.
- [ ] meta: id slug (= filename for built-ins), title + translation, level,
      source + license (+ author credit), tags, book/chapter if multi-part.
- [ ] Copyright: bundled only if owned/PD/openly licensed; otherwise the file is
      outside `texts/` and the user was told it's for private upload.

## Efficiency for long texts

- Segment **paragraph by paragraph**, writing the shorthand directly; don't
  build token arrays by hand unless a token needs object form.
- Build the dictionary from the **set of unique keys**: write the body first,
  then `node tools/validate.mjs <file>.json --skeleton` prints a stub for every
  missing key, in order of first use, with `parts` already derived from the
  soft boundaries. Paste them into `dictionary` and fill `py`/`pos`/`en` in one
  pass (empty stubs fail validation, so nothing slips through).
- Reuse entries across chapters of a book (copy the previous chapter's
  dictionary, then let the validator's "unused" warnings tell you what to drop).
- Run the validator after each few paragraphs on long chapters — `--source`
  catches dropped text early, when it's cheap to fix.
