# docs-src: sources for the viva site

`npm run docs` turns these into the pages in `docs/`, which GitHub Pages serves (Settings → Pages → Deploy from a branch → `main`, folder `/docs`).

| File | What it is | In git? |
|---|---|---|
| `viva-sheet.md` | The viva sheet. Edit it, then run `npm run docs`. | Yes |
| `transcripts/cowork.md` | The Cowork conversation as Markdown. A raw chat paste has no speaker names, so put a `**User:**` line before each of your messages and a `**Claude:**` line before each reply (`## User`, `User:` and `Human:` also work). | No (ignored) |
| `transcripts/code-m0.txt` | The Claude Code session, saved with the `/export` command. Read as it is: no editing needed. | No (ignored) |

The raw transcripts stay out of git on purpose: the build replaces secrets, e-mail addresses, home-folder paths and 32-character hex IDs in the pages it writes, but the raw files are not cleaned. The build also lists anything that looks like a bank or phone number so you can check it before you publish.

If a transcript is missing, its part of `docs/transcript.html` shows "not added yet". If a file has no speaker labels it is shown as one document, and the build says so. The build prints how many turns it found in each file.
