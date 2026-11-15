# Metalboard — MB–02 Flow Workstation

The app uses the SPEC-01 hardware language requested for the redesign. Keep this system consistent across the canvas, blocks, inspector and dialogs.

## Reference and licensing

Reference: https://github.com/shuding/spec-01 by Shu Ding, MIT. The hardware palette, key construction and LCD treatment are adapted to Metalboard's existing React/tldraw components. This is a CSS adaptation, not an installation of the Vercel UI SDK behavior layer. MIT notice: `docs/licenses/spec-01-MIT.txt`.

Spec Mono is the reference's IBM Plex Mono subset. Font files are local under `public/fonts/`, with their embedded SIL Open Font License notices preserved. Core and extended subsets support Portuguese. No external font request is needed.

## Structure

Technical Workbench: a molded chassis, compact single-row instrument header, recessed workspace-name display, inset infinite canvas, grouped drawing/building keys, and a status rail. Grid and fit controls live beside the only zoom control in the status rail; the native navigation panel is omitted. Native main menu, page management, undo and redo are mounted in the app header through the SDK container/provider APIs, with popups outside the clipped canvas. Duplicate, delete and the full actions menu appear with the selection. The native toolbar action row is removed to avoid duplication. On small screens the drawing row keeps select, pan, draw, eraser, overflow and styles; the arrow remains available through A and the overflow menu. The SDK tool-lock control keeps its own row when needed. On mobile, history stays in the main menu and import/export move into that menu, leaving a compact page-switch key beside the board name. Mermaid generation is contextual: a floating action follows a convertible selection, hides while editing or dragging, and is unavailable in read-only mode. The desktop menu uses the same conversion. Block headers use a compact 32px strip with unboxed icons and type labels. Output blocks devote the body to a 14px text display; provenance and copy share one compact footer. Properties launches from the dock (Option+P / Alt+P) into a right-edge inspector. On narrow screens its launcher moves into the app header to preserve the six-key touch rows; the inspector leaves the dock accessible. Escape and the close key return focus to the canvas controls. The existing block utilities and dataflow inspector retain ownership of their behavior. App content carries the design; do not add marketing sections or invented metrics.

## Theme

`src/tokens.css` owns the palette, typography, motion and material tokens. `src/hardware.css` applies the skin after the existing styles and tldraw stylesheet.

- Panel: `--paper-0: #d9d9d6`; raised surface: `--paper-2: #f3f3f1`.
- Ink: `--ink-1: #1d1d1c`; secondary: `--ink-2: #4c4c47`; muted: `--ink-3: #62625c`.
- Signal key: `--accent: #ed5a28` with dark `--accent-ink` legends. Use `--accent-text` for small orange text on light surfaces.
- LCD: `--lcd-fill` / `--lcd-ink`. Terminal glass: `--screen` / `--screen-ink`.
- The device has a fixed light chassis, including when the operating system uses dark mode. tldraw and Mermaid must use the same light appearance.
- Functional status lamps use `--status-on`; errors use the error tokens and accompanying text.

## Type and spacing

### Camadas brand

The approved Camadas identity uses three stepped, connected-looking layers. The mark has a 96×80 grid, consistent 3-unit corner radii and at least 8 units between adjacent horizontal edges. Keep its orientation and proportions. The lettering is an original monospaced lowercase vector drawing, with a 28-unit advance; it requires no installed font. The UI continues to use Spec Mono.

`scripts/build-brand.mjs` owns the vector geometry and reads colors from `src/tokens.css`. Run `npm run brand:generate` after editing its geometry or the palette. It writes the SVGs under `public/brand/`, the favicon, `src-tauri/app-icon.svg`, and the platform icon set under `src-tauri/icons/`. Do not edit generated assets individually.

The header uses `mark.svg` and `wordmark.svg` as CSS masks, colored with `--accent` and `--ink-1`. Keep the identity compact: 20px-wide symbol directly on the header (no badge, background or shadow), 8px gap and 126px-wide wordmark. Its accessible name is Metalboard; at narrow widths the wordmark hides and the symbol remains. The standalone `logo.svg` is orange/ink and `logo-mono.svg` inherits `currentColor` when embedded inline. The native app tile uses the theme's light key material (`--key-top`, `--key-bottom`, `--key-edge`) with a smaller flat orange symbol. The favicon uses the light chassis color. Do not restore a dark tile behind the brand. Platform icon changes require rebuilding/restarting the desktop app.

Spec Mono throughout the interface, weight 400 for content and 500 for labels. Monospaced type is the instrument identity. Document reading text is 15–16px; compact controls use 10–12px. Drawn content retains the user's selected font. Numbers use tabular figures. Headings remain upright.

Use the named 4px spacing scale. Radii: 4px keys, 6px wells, 10px instrument panels. Buttons have a visible edge, top highlight and shallow drop shadow. Fields use inset shadows. Gradients represent material lighting only.

## Interaction

Raised keys depress by 2px, with no spring motion. Hover changes material tone. Focus rings appear immediately and respect keyboard navigation. Disabled controls retain their labels and context. Do not add synthesized sounds or haptics. Reduced-motion users receive no decorative transitions or animated flow edges.

Primary actions use the orange key; secondary actions use neutral keys. Active tabs use charcoal. The active drawing tool and selection outline use the orange signal. Preserve Portuguese action labels and the current persistence/import/export contracts.

## Responsive behavior

Use a compact icon-only tool dock. Drawing and block insertion keys share size, radius, relief and icon weight. Separate the two groups with one thin divider; reserve orange for the selected drawing tool. Text labels are omitted; accessible names and hover titles remain. Tiny bottom-right legends show real shortcuts: V/H/D/E/A for native tools and Option+1 through Option+6 (Alt on other platforms) for block insertion. Block shortcuts only run with canvas focus and never while editing fields or while a menu/modal is open. A collapse key (Option+B / Alt+B) hides every toolbar item, leaving a single restore key; this preference persists locally and shortcuts stay active. Below 620px stack the groups into two rows and use 44px keys. The inspector grows into the space freed by the collapsed dock. Below 600px retain a single compact header row with the brand mark, editable board name and accessible import/export icon keys; compact canvas controls to accessible icon buttons. Keep the inspector within the viewport and scroll its content. Verify at 320, 375, 414 and 768px as well as desktop.
