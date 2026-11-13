'use strict';
// Colour math shared by the theme generator and the studio's brightness and
// contrast controls. OKLCH keeps the hue while lightness or colourfulness moves.
const channel = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
const linear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
const gamma = x => x <= .0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - .055;
const valid = hex => typeof hex === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex);

function luminance(hex) {
  return [0, 1, 2].map(i => linear(channel(hex, i))).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + .05) / (y + .05);
}
function blend(a, b, t) {
  return '#' + [0, 1, 2].map(i => Math.round((channel(a, i) * (1 - t) + channel(b, i) * t) * 255).toString(16).padStart(2, '0')).join('');
}
function toOklch(hex) {
  const [r, g, b] = [0, 1, 2].map(i => linear(channel(hex, i)));
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .793617785 * m - .0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
// The closest displayable colour: chroma is reduced until it fits sRGB.
function fromOklch(L, C, H) {
  L = Math.min(1, Math.max(0, L));
  for (let c = Math.max(0, C); ; c = Math.max(0, c - .002)) {
    const a = c * Math.cos(H * Math.PI / 180), b = c * Math.sin(H * Math.PI / 180);
    const [l, m, s] = [[.3963377774, .2158037573], [-.1055613458, -.0638541728], [-.0894841775, -1.291485548]].map(([x, y]) => (L + x * a + y * b) ** 3);
    const rgb = [[4.0767416621, -3.3077115913, .2309699292], [-1.2684380046, 2.6097574011, -.3413193965], [-.0041960863, -.7034186147, 1.707614701]]
      .map(([x, y, z]) => x * l + y * m + z * s);
    if (c === 0 || rgb.every(v => v >= -1e-4 && v <= 1.0001)) {
      return '#' + rgb.map(v => Math.round(gamma(Math.min(1, Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('');
    }
  }
}
// The same hue, moved away from the backgrounds until it reads at `minimum`.
function readable(color, backgrounds, minimum = 4.6) {
  const list = [].concat(backgrounds), ok = c => list.every(bg => contrast(c, bg) >= minimum);
  if (ok(color)) return color;
  const [L, C, H] = toOklch(color), step = luminance(list[0]) < .18 ? .01 : -.01;
  for (let next = L + step; next >= 0 && next <= 1; next += step) {
    const candidate = fromOklch(next, C, H);
    if (ok(candidate)) return candidate;
  }
  return step > 0 ? '#ffffff' : '#000000';
}
// Comments keep their hue where possible, with visible colour and contrast.
// Lightness moves first; a nearby hue avoids other code roles when necessary.
function commentColor(color, background, accept = () => true) {
  const [L, C, H] = toOklch(color), hue = C < .015 ? 150 : H;
  for (const offset of [0, 15, -15, 30, -30, 45, -45, 60, -60]) {
    for (let step = 0; step <= 100; step++) for (const lightness of [L + step * .01, L - step * .01]) {
      if (lightness < 0 || lightness > 1) continue;
      const candidate = fromOklch(lightness, Math.min(.16, Math.max(.09, C)), hue + offset);
      if (contrast(candidate, background) >= 5 && toOklch(candidate)[1] >= .08 && accept(candidate)) return candidate;
    }
  }
  return readable(color, background, 5);
}
// Studio controls: brightness changes colourfulness, contrast the lightness
// distance from the editor background. Text never drops below 4.5:1.
function tune(color, background, brightness = 0, contrastShift = 0) {
  if (!valid(color) || !valid(background) || (!brightness && !contrastShift)) return color;
  const alpha = color.slice(7), [L, C, H] = toOklch(color.slice(0, 7)), [Lb] = toOklch(background.slice(0, 7));
  const next = fromOklch(Lb + (L - Lb) * (1 + contrastShift / 100), C * (1 + brightness / 100), H);
  return readable(next, background.slice(0, 7), Math.min(4.5, contrast(color.slice(0, 7), background.slice(0, 7)))) + alpha;
}
module.exports = { luminance, contrast, blend, toOklch, fromOklch, readable, commentColor, tune, valid };
