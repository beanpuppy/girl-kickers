# Doctgen

Generates Door Kickers 2 doctrine screen GUI XML from KDL layout descriptions.

## Web App

The web app provides a KDL editor with syntax highlighting, a structural preview of the layout, and compiled XML output.

### Building

```bash
bun install
bun build app.ts --outdir dist --bundle --minify
```

Or via mise:

```bash
mise run build-doctgen
```

Then open `index.html` in a browser.

## CLI

```bash
# single file
bun www/doctgen/src/cli.ts doctrines/defy.kdl -o mod/gui/gfl_doctrine.xml

# multiple files combined into one XML
bun www/doctgen/src/cli.ts doctrines/*.kdl -o mod/gui/gfl_doctrine.xml
```

Or via mise:

```bash
mise run doctgen
```

## Tests

```bash
bun test tests/
```

## Format

See [FORMAT.md](FORMAT.md) for the KDL format reference, or click "KDL Reference" in the web app.
