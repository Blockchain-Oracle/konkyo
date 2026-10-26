# Sample data

Konkyo answers from a person's own library, so the repository holds **no source files**. The sample
library is eight openly licensed sources, downloaded from their publishers when someone starts a
sample (the starter cards on Home, or `pnpm konkyo seed`), and read like any upload. The recorded
runs in [`examples/`](../examples/README.md) keep what came back from each service, so sample mode
needs none of them.

## The sources

Defined in [`packages/config/src/starters.ts`](../packages/config/src/starters.ts). Counts are
from the sample library as read on 2026.

| Source | Licence | Used | Pages | Passages |
|---|---|---|---|---|
| Spielman, Jenkins & Lovett, *Psychology 2e*, [8.1 How Memory Functions](https://openstax.org/books/psychology-2e/pages/8-1-how-memory-functions), OpenStax (2020) | CC BY-NC-SA 4.0 | the section's web page | 8 | 25 |
| *Psychology 2e*, [8.2 Parts of the Brain Involved with Memory](https://openstax.org/books/psychology-2e/pages/8-2-parts-of-the-brain-involved-with-memory) | CC BY-NC-SA 4.0 | the section's web page | 4 | 13 |
| *Psychology 2e*, [8.3 Problems with Memory](https://openstax.org/books/psychology-2e/pages/8-3-problems-with-memory) | CC BY-NC-SA 4.0 | the section's web page | 10 | 30 |
| John Gabrieli, *9.00SC Introduction to Psychology*, Lecture 10: Memory I, slides, [MIT OpenCourseWare](https://ocw.mit.edu) (Fall 2011) | CC BY-NC-SA 4.0 | the lecture's slide PDF (its 6 scanned pages read with OCR) | 76 | 100 |
| Lecture 10: Memory I, transcript, MIT OpenCourseWare | CC BY-NC-SA 4.0 | the transcript PDF | 29 | 57 |
| Nishida & Walker (2007), [*Daytime Naps, Motor Memory Consolidation and Regionally Specific Sleep Spindles*](https://doi.org/10.1371/journal.pone.0000341), PLOS ONE | CC BY | the article PDF | 7 | 37 |
| Diekelmann (2014), [*Sleep for cognitive enhancement*](https://doi.org/10.3389/fnsys.2014.00046), Frontiers in Systems Neuroscience | CC BY 3.0 | the article PDF | 12 | 63 |
| Muehlroth et al. (2019), [*Precise Slow Oscillation–Spindle Coupling Promotes Memory Consolidation in Younger and Older Adults*](https://doi.org/10.1038/s41598-018-36557-z), Scientific Reports | CC BY 4.0 | the article PDF | 15 | 69 |
| **Total** | | | **161** | **394** |

They make two folders: **Sample course: Memory** (the OpenStax sections and the lecture) and
**Essay starter: Sleep and learning** (the three papers). No personal or confidential data is used.

## How the data reaches Zetaris

Every source, sample or uploaded, goes the same way
([`packages/zetaris/src/evidence.ts`](../packages/zetaris/src/evidence.ts)):

1. The worker reads the file into passages (page and position kept) and publishes them as JSON to
   a Zetaris `FILESTORE` table, `konkyo.konkyo_passages`.
2. It hands Zetaris the PDF itself and keeps **Zetaris's own reading** of it,
   `konkyo.konkyo_pdf_text`: a second extraction, independent of Konkyo's.
3. The file is marked Ready only after Zetaris answers for it. From then on, every quote an answer
   gives is checked against that reading in one Spark SQL statement.

Topic watches add a third kind of table: a Zetaris Lightning `REST` table over the OpenAlex API
([`packages/zetaris/src/watch.ts`](../packages/zetaris/src/watch.ts)). Nothing is registered by
hand: the worker creates the Zetaris database and its tables the first time it runs, then fills them.

## Regenerate it

- In the app: the "Study a sample course" and "Start an essay" cards on Home.
- From the terminal, with the services and `.env` from the main README:
  ```bash
  pnpm konkyo seed --user you@example.com
  ```
- Without any of it: `SAMPLE_MODE=true pnpm konkyo`, which replays [`examples/`](../examples/README.md).

## Limits

- The sources are downloaded from OpenStax, MIT OpenCourseWare and the journals at seed time; if
  one is unreachable, that file shows "Couldn't reach" and the rest still work.
- Six of the 76 lecture slide pages are scanned images: their text comes from OCR, so a few words
  there can be off.
- OpenStax and OCW material is non-commercial (CC BY-NC-SA); it is used here as a free sample.
