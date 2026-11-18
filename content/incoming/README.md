# Incoming raw texts (spoken-register Mandarin)

These are raw texts waiting to be converted into the app's segmented JSON
(see `docs/FORMAT.md`). Each `.txt` file starts with a header block (source,
license, level, split points, image info, notes on edits and third-party
material), then `---`, then the text with paragraphs separated by blank
lines. Paragraph numbers in the headers count those blank-line-separated
paragraphs, starting at 1. `chars` counts Han characters only.

Retrieved 2026-11-18. I checked every license on the site itself: the post
footer, or the site's about/license page.

## Collected pieces (ranked by fit)

| # | slug | title | source | license | chars | level | register notes |
|---|------|-------|--------|---------|------:|-------|----------------|
| 1 | `imcbc-middle-school-memories` | 终不似，少年游 | ImCBC blog (imcbc.cn) | CC BY-NC 4.0 | 1,298 | HSK 5 | Plain, diary-like first-person memories of middle school (a first crush, bullying, being a "bad kid"). Short, natural sentences. The best match for "spoken prose". |
| 2 | `zu1k-involution-rant` | 干！有人在卷我 | zu1k.com | CC BY-NC 4.0 | 2,728 (3 parts) | HSK 6 | A student rant about 内卷 and 躺平: swearing, asides in brackets, rhetorical questions, internet slang. Strong internet-culture piece. Has some swearing and one sarcastic political aside. |
| 3 | `kivinsae-gangjing-desensitize` | 让我们粗鄙一点 | Kivinsae's Nest | **CC BY 4.0** | 1,295 | HSK 5-6 | A casual, self-deprecating post about 杠精 and online arguing culture. Talks to the reader directly. The most permissive license here. |
| 4 | `rachel-quitting-beijing-job` | 我依然在遵从内心地做出决定 | Rachel's Blog | CC BY-NC-SA 3.0 | 4,171 (4 parts) | HSK 5→6 | "我裸辞了！": a young programmer quits a Beijing tech job. Has dialogue with a mentor and slang (裸辞, 面基, 加班, 小红书). Gets more literary later. 7 photos (licensed, but they need alt text). |
| 5 | `xeonzilla-zhihu-invitation` | 知乎小记二则（其一：登陆知乎） | x7aNote (xeonzilla.top) | CC BY-NC-SA 4.0 | 972 | HSK 5-6 | A blogger gets a "join Zhihu" invite and thinks about traffic and platforms. Social-media topic. Quotes the platform's chatty invitation message (third-party: see caveats). |
| 6 | `paipai-toddler-diary-17m` | 派派成长日记 #17 - NoNoNo（1y5m） | Henry Z's blog (changchen.me) | CC BY-NC 4.0 | 870 | HSK 4-5 | A dad's monthly toddler diary: lists of "第一次…", everyday family language. The easiest piece. |
| 7 | `wikinews-uruguay-rider-interview` | 创建慈善基金会的乌拉圭女骑手向记者吐露心声 | Chinese Wikinews | **CC BY 4.0** | 1,052 | HSK 5-6 | Q&A interview transcript (维基新闻：… / 马尔多纳多：…). First-person answers, but **translated from Spanish**, so the Chinese is polished rather than native speech. 1 photo (CC BY-SA 4.0, Commons). |
| 8 | `reorx-heroes-of-the-storm` | 《风暴英雄》对我的意义 | Reorx's Forge | **CC BY-SA 4.0** | 1,238 | HSK 5 | A reflection on how an online game cured a shy person's fear of competing. Gamer vocabulary. A little more written than the others. |

Variety: internet and social-media culture (2, 3, 5), personal stories (1, 4,
8), daily and family life (6), interview (7).

### Licensing caveats before publishing

- **Non-commercial (NC):** pieces 1, 2, 4, 5 and 6. This is fine while the app
  stays free and non-commercial. Store the license per text (`meta.license`)
  so it can't be lost.
- **Share-alike (SA):** for pieces 4, 5 (NC-SA) and 8 (BY-SA), the segmented
  JSON is an adaptation and must be released under the same license. For
  piece 7, the **image** is BY-SA 4.0 while the text is BY 4.0.
- **Attribution:** every license here needs the title, author, source URL and
  license link, plus a note that the text was modified (segmented and
  glossed). Put this in `meta.author`, `meta.source` and `meta.license`, and
  show it in the app.
- **Third-party quotes:**
  - Piece 4: the song lyrics of 《辞职信》 were removed; the file notes where.
  - Piece 5: paragraphs 2-11 are a quoted invitation message from Zhihu staff.
    The blog license doesn't clearly cover it. Drop those paragraphs if you
    want zero risk (the rest is 671 characters).
  - Piece 7: a translation of a Spanish Wikinews interview. Both are CC BY.
- **License version mismatch:** Rachel's post footer says CC BY-NC-SA **3.0**,
  but her homepage footer links 4.0. I recorded 3.0, the version the post
  itself states.
- **Content to review:** swearing in pieces 2 and 4; a sarcastic political
  aside in piece 2 (paragraph 24); the "武装直升机性恋" meme in piece 3
  (paragraph 27).
- **Privacy:** I deliberately did not record the toddler photos in piece 6.
- **Wikinews:** all Wikinews editions went permanently read-only on
  2026-05-04. Pages stay online under CC BY 4.0.

## Links only (not redistributable, for personal reading)

These are all rights reserved (or CC BY-NC-ND), so read them on the original
site. Do not bundle them.

1. **失业后，我决定去做一个农民** (故事FM, repost on 虎嗅, 2022): a 49-year-old
   who lost his job and grows his own food outside Beijing. Mostly his own
   words from the podcast. https://www.huxiu.com/article/543461.html
2. **《TED中文》文字稿：《故事FM》创始人用声音纪录片探索什么样的人生值得过 | 寇爱哲**: a
   relaxed talk transcript in Simplified Chinese (TED, all rights
   reserved). https://www.ted.com/pages/tedinchinese-transcripts-kouaizhe2021
3. **"我这样一个文静的人怎么会被人说神经" (匡扶, 一席 talk #613)**: a stand-up-style
   talk transcript ("大家好，我叫匡扶…谢谢大家，真的讲完了") about drawing comics and
   childhood. https://www.digitaling.com/articles/69537.html
4. **年过50，我在工厂流水线打捞生活** (全民故事计划 #672, 澎湃号): a 51-year-old migrant
   worker tells his story, with dialogue and dialect.
   https://www.thepaper.cn/newsDetail_forward_20186908
5. **我在加油站做"打工人"的日子** (人间故事铺, 澎湃号): a graduate's first-person
   account of working at a petrol station.
   https://m.thepaper.cn/newsDetail_forward_10205990
6. **2021-2023年终总结：跃入人海，潮起潮落** (idealclover, 少数派): a chatty year-in-review
   full of internet tone markers (hh, QAQ, XD). https://sspai.com/post/86606

## More licensed candidates (checked, not collected)

These were verified as openly licensed and would also work, so they are
ready if more texts are wanted:

- Kivinsae (CC BY 4.0): **关于说话：不要叠加态，不要反问句** (about 2,000 characters, on
  vague, hedged ways of talking online and at work; touches on censorship
  lightly) https://www.kivinsae.com/2023/04/14/2023-04-14-talk_straightforward/
  and **窜访游记：红山森林动物园** (about 1,000, a zoo visit; a few Traditional
  characters by the author) https://www.kivinsae.com/2023/08/07/2023-08-07-hongshan_zoo/
- ddadaal.me (CC BY-SA 4.0): **在西雅图，给生活换个环境** (about 4,300) and **我是如何将自己逐出主流就业圈的** (about 3,100).
- zu1k (CC BY-NC 4.0): **我的表达欲在减少** (about 2,000).
- Henry Zhu (CC BY-NC 4.0): the other 派派成长日记 entries (monthly, short).
- 伯正博客 chenbozheng.com (CC BY 3.0): short first-person travel notes, e.g. 走出课本看日月潭.
- Public-domain classics, if older vernacular is acceptable: 胡适《差不多先生传》,
  鲁迅《一件小事》 (both 1919, on Wikisource).

## Sources checked and rejected

- **Global Voices 中文** (zhs.globalvoices.org; zh.globalvoices.org redirects to
  the Traditional zht site). The footer license is CC BY 3.0. But recent
  Simplified articles (2024) are translated, formal analysis pieces (Chinese
  investment abroad, energy and so on), not spoken register. The spoken
  content there is usually quoted Weibo/X posts, which the license does not
  clearly cover.
- **Chinese Wikinews**: CC BY 4.0, but nearly all of it is news register. Only
  the interviews fit (one collected). Its API rate-limited my scripted
  searches (HTTP 429).
- **Diff (Wikimedia blog)**: very little Chinese content, and it is
  institutional.
- **CSDN**: original posts show a "CC 4.0 BY-SA" notice, but the site blocks
  scripted access (HTTP 521). Many "原创" posts are really reposts, so the
  provenance is unreliable.
- **ND-licensed sources**: 阮一峰的网络日志, SegmentFault, TED transcripts, and
  several independent blogs (kawabangga, mokeyjay, imalan and others) are
  BY-NC-ND or similar. Segmenting and glossing is arguably an adaptation, so
  these were skipped.
- **Platforms that are all rights reserved**: 知乎, 微博, 小红书, 豆瓣, WeChat
  accounts (故事FM, 一席, 真实故事计划, 全民故事计划), 少数派, 虎嗅, 澎湃 and Medium are
  links-only.
- **VOA Chinese**: VOA's own material is public domain, but it is news
  register and politically sensitive, so not pursued.
- **Method used to find blogs**: I scanned about 930 life/essay-tagged blogs
  from the
  [chinese-independent-blogs](https://github.com/timqian/chinese-independent-blogs)
  list for Creative Commons links (about 94 had one), then read the recent
  personal posts of the non-ND ones.
