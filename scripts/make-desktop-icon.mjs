import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#1A1A1D"/>
  <g transform="translate(16 16)">
    <path d="M54.5 28 V45 L32 58 L9.5 45 V19 L32 6 L43 12.4"
          fill="none" stroke="#E9E6DF" stroke-width="5.2"
          stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M20.6 43.6 L48.2 16.2 Q51.6 13.4 50.6 17.6 L23.6 45.8 Q21 47.4 20.6 43.6 Z"
          fill="#E8913A"/>
    <circle cx="21.4" cy="45" r="3.1" fill="#E8913A"/>
  </g>
</svg>`;

const assetsDir = path.resolve('assets');
fs.mkdirSync(assetsDir, { recursive: true });
const svgBuf = Buffer.from(SVG);

await sharp(svgBuf, { density: 300 })
  .resize(1024, 1024)
  .png()
  .toFile(path.join(assetsDir, 'icon.png'));
console.log('assets/icon.png (1024x1024)');

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = [];
for (const s of sizes) {
  pngs.push(await sharp(svgBuf, { density: 300 }).resize(s, s).png().toBuffer());
}
const ico = await pngToIco(pngs);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
console.log('assets/icon.ico (' + sizes.join(', ') + ')');