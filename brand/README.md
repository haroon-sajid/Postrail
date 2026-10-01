# Postrail brand assets

Source files for the Postrail mark and wordmark. The console serves copies from
`apps/web/public/brand`; edit here first, then copy across.

| File                     | Use                                                                |
| ------------------------ | ------------------------------------------------------------------ |
| `postrail-icon.svg`      | The mark alone. Favicon, app icons, avatars. Square, 512 viewBox.  |
| `postrail-logo.svg`      | Mark plus wordmark on light backgrounds. Transparent, 794x230.     |
| `postrail-logo-dark.svg` | Mark plus wordmark on dark backgrounds. Transparent, 794x230.      |
| `postrail-icon-1024.png` | The mark at 1024px, rendered from the SVG.                         |
| `postrail-icon-512.png`  | Mark at 512px for stores and directories that want a PNG.          |
| `postrail-logo.png`      | Logo on white, 1840x720. Slides, docs, places that cannot use SVG. |
| `postrail-logo-dark.png` | Logo on navy, 1840x720. Same uses, dark surfaces.                  |

## Colours

The mark is a "P" whose bowl is an envelope: the letter for Postrail, the flap for mail.

| Name         | Hex       | Where                                                           |
| ------------ | --------- | --------------------------------------------------------------- |
| Emerald      | `#10B981` | Top-left of the mark's tile. Also the console's primary colour. |
| Deep emerald | `#047857` | Bottom-right of the tile; the two form its gradient.            |
| Flap green   | `#059669` | The envelope flap drawn inside the white "P".                   |
| Navy         | `#0F1B2D` | Wordmark on light backgrounds; the plate behind the dark logo.  |
| Cream        | `#F5F5F2` | Wordmark on dark backgrounds.                                   |

In the console the wordmark is live text beside the inline mark
(`apps/web/src/components/logo.tsx`), so it follows the theme; the SVG logos here carry the
name as outlines for places that cannot load the interface font.

## Rules

- Keep the wordmark at 32px tall or more. The mark is taller than the letters, so below that
  the name becomes hard to read.
- Do not put the dark logo on a background other than navy or near-black. It has no
  backing plate of its own.
- Do not recolour the mark. On a coloured background use the PNG with a plate.
- Regenerate the favicon set and the PNGs from `postrail-icon.svg` if the mark changes
  (render the SVG in a browser at each size; the corners stay transparent). The set is
  `favicon.ico` (16, 32, 48), `brand/favicon-32.png`, `brand/icon-192.png`,
  `brand/icon-512.png` and `apple-touch-icon.png` (180), all under `apps/web/public`.
