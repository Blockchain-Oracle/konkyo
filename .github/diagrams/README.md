# README diagrams

The README pictures are rendered from `readme-system.mmd` (the whole system) and
`readme-answer.mmd` (the path one answer takes). The colours in `mermaid-dark.json` and
`mermaid-light.json` are Konkyo's own tokens (lime, violet and pink on ink or paper). Edit the
Mermaid source, then render light and dark PNGs into `.github/assets/` with Mermaid CLI at 2×.

```sh
mmdc -i .github/diagrams/readme-system.mmd -o .github/assets/system-dark.png -c .github/diagrams/mermaid-dark.json -b '#0b0b0e' -s 2
mmdc -i .github/diagrams/readme-system.mmd -o .github/assets/system-light.png -c .github/diagrams/mermaid-light.json -b '#fffaf7' -s 2
mmdc -i .github/diagrams/readme-answer.mmd -o .github/assets/answer-dark.png -c .github/diagrams/mermaid-dark.json -b '#0b0b0e' -s 2
mmdc -i .github/diagrams/readme-answer.mmd -o .github/assets/answer-light.png -c .github/diagrams/mermaid-light.json -b '#fffaf7' -s 2
```

Mermaid CLI needs a local Chromium. Where Puppeteer can't find one, add
`-p .github/diagrams/puppeteer.json` and set its `executablePath` to your Chrome.
