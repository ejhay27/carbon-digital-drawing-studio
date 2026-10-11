// Rasterises the CARBON vector brand assets (assets/*.svg) into the PNG sources
// expected by `@capacitor/assets`. Requires `sharp` (installed on demand by android.mjs).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.resolve('assets');
const jobs = [
  ['icon-only.svg', 'icon-only.png', 1024],
  ['icon-foreground.svg', 'icon-foreground.png', 1024],
  ['icon-background.svg', 'icon-background.png', 1024],
  ['splash.svg', 'splash.png', 2732],
  ['splash.svg', 'splash-dark.png', 2732],
];

for (const [src, out, size] of jobs) {
  const svg = fs.readFileSync(path.join(dir, src));
  await sharp(svg, { density: 144 }).resize(size, size).png().toFile(path.join(dir, out));
  console.log(`  ✓ assets/${out} (${size}×${size})`);
}
