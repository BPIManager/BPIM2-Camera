import sharp from "sharp";

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#14171c"/>
<rect x="${96 + pad}" y="${150 + pad}" width="${320 - pad * 2}" height="${212 - pad * 2}" rx="14" fill="none" stroke="#ffffff" stroke-width="16"/>
<circle cx="256" cy="256" r="${44 - pad / 2}" fill="#4fd8e6"/>
</svg>`;

for (const [name, size, pad] of [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["icon-maskable-512.png", 512, 30]]) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/${name}`);
}
