# Qublox Sales interface

The sales workspace uses the Qublox website brand in a restrained app setting.
Source: `../qublox-website/src/app/tokens.css` and `src/components/chrome/Header.tsx`.

- Warm bone canvas, near-black ink, deep signal red for primary controls and selections.
- Archivo variable, locally hosted. One type family for headings, forms and data.
- Existing horizontal navigation, capped 1440px workspace, table-first pipeline, split evidence/message review. Keep current routes and component logic.
- Six-pixel control radius. Horizontal table rules. Tinted inline forms, no nested cards or large shadows.
- Sentence-case untracked labels, tabular numbers, red focus outlines, reduced-motion support.
- On phones retain all fields and actions; allow table scrolling with the identifying column pinned. Collapse existing grids to one column.
- No new imagery, invented figures, marketing sections or decorative animation.

Tokens live in `apps/web/src/styles/tokens.css`. UI changes must preserve input names, event handlers, destinations, approval and sending rules.
