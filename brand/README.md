# Postrail brand assets

Source files for the Postrail mark and wordmark. The console serves copies from
`apps/web/public/brand`; edit here first, then copy across.

| File                     | Use                                                                  |
| ------------------------ | -------------------------------------------------------------------- |
| `postrail-icon.svg`      | The mark alone. Favicon, app icons, avatars. Square, 512 viewBox.    |
| `postrail-logo.svg`      | Mark plus wordmark on light backgrounds. Transparent, 794x230.       |
| `postrail-logo-dark.svg` | Mark plus wordmark on dark backgrounds. Transparent, 794x230.        |
| `postrail-icon-1024.png` | Raster master for the mark. Every PNG icon size is rendered from it. |
| `postrail-icon-512.png`  | Mark at 512px for stores and directories that want a PNG.            |
| `postrail-logo.png`      | Logo on white, 1840x720. Slides, docs, places that cannot use SVG.   |
| `postrail-logo-dark.png` | Logo on navy, 1840x720. Same uses, dark surfaces.                    |

## Colours

| Name    | Hex       | Where                                               |
| ------- | --------- | --------------------------------------------------- |
| Navy    | `#0F1B2D` | Mark background, wordmark on light.                 |
| Cream   | `#F5F5F2` | Envelope, wordmark on dark.                         |
| Emerald | `#12B981` | The check badge. Also the console's primary colour. |

## Rules

- Keep the wordmark at 32px tall or more. The mark is taller than the letters, so below that
  the name becomes hard to read.
- Do not put the dark logo on a background other than navy or near-black. It has no
  backing plate of its own.
- Do not recolour the mark. On a coloured background use the PNG with a plate.
- Regenerate the favicon set from `postrail-icon-1024.png` if the mark changes. The set is
  `favicon.ico` (16, 32, 48), `brand/favicon-32.png`, `brand/icon-192.png`,
  `brand/icon-512.png` and `apple-touch-icon.png` (180), all under `apps/web/public`.
