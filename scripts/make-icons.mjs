import sharp from "sharp";

/**
 * PWA のアイコン。オンボーディングのロゴ（src/components/brand-mark.tsx）と同じ絵:
 * ファインダーの四隅（Camera）の中に、BPIM2 のロゴと同じ段々低くなる 4 本の棒。2 本目だけ濃く、水色。
 * 絵を変えたら、brand-mark.tsx と、ここを揃える。
 *
 * 角丸にはしない。背景は四隅まで塗った正方形にする（OS が自分の形に切り抜くので、
 * こちらで角丸にすると二重に丸まり、四隅に余白が出る）。
 * 絵の拡大率 scale: 安全領域（直径の 80% の円）に収めるマスカブルは 1。ふつうの（any）アイコンと iOS は、見やすいよう大きめ。
 */
const BG = "#14171c";
const FG = "#f4f5f7";
const BPIM = "#3b82f6"; // BPIM2 のロゴの青（hsl 217 91% 60%）
const PRIMARY = "#4fd8e6";

const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 96 96">
<rect width="96" height="96" fill="${BG}"/>
<g transform="translate(48 48) scale(${scale}) translate(-48 -48)">
  <g fill="none" stroke="${FG}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 34V26a4 4 0 0 1 4-4h8"/>
    <path d="M62 22h8a4 4 0 0 1 4 4v8"/>
    <path d="M74 62v8a4 4 0 0 1-4 4h-8"/>
    <path d="M34 74h-8a4 4 0 0 1-4-4v-8"/>
  </g>
  <rect x="28" y="31" width="7" height="34" rx="1.5" fill="${BPIM}" opacity="0.45"/>
  <rect x="39" y="42" width="7" height="23" rx="1.5" fill="${PRIMARY}"/>
  <rect x="50" y="52" width="7" height="13" rx="1.5" fill="${BPIM}" opacity="0.45"/>
  <rect x="61" y="60" width="7" height="5" rx="1.5" fill="${BPIM}" opacity="0.45"/>
</g>
</svg>`;

const ICONS = [
  ["icon-192.png", 192, 1.3],
  ["icon-512.png", 512, 1.3],
  ["icon-maskable-512.png", 512, 1],
  // iOS のホーム画面。iOS が角丸に切り抜く（透明は黒くなるので、背景は塗る）
  ["apple-touch-icon.png", 180, 1.2],
];

for (const [name, size, scale] of ICONS) {
  await sharp(Buffer.from(svg(scale))).resize(size, size).png().toFile(`public/${name}`);
}
