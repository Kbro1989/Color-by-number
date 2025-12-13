import { PaletteColor, PaletteTheme, RGB } from '../types';

// RGB <-> HSL conversions
const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
};

const hslToRgb = (h: number, s: number, l: number): RGB => {
  let r, g, b;
  if (s === 0) {
    r = g = b = l; 
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
};

const rgbToHex = (r: number, g: number, b: number) =>
  "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

export const applyTheme = (palette: PaletteColor[], theme: PaletteTheme): PaletteColor[] => {
  if (theme === PaletteTheme.STANDARD) return palette;

  return palette.map(p => {
    let [h, s, l] = rgbToHsl(p.rgb.r, p.rgb.g, p.rgb.b);

    switch (theme) {
      case PaletteTheme.CHROMATIC:
        s = Math.min(1, s * 1.5); // Boost saturation
        break;
      case PaletteTheme.PRISMATIC:
        s = 1.0; // Max saturation
        l = 0.5; // Normalized lightness for pure color
        break;
      case PaletteTheme.CHALK:
        s = Math.max(0, s * 0.7); // Desaturate
        l = Math.min(1, l * 1.3 + 0.1); // Lighten
        break;
      case PaletteTheme.MARKER:
        s = Math.min(1, s * 1.2); 
        l = Math.max(0, l * 0.8); // Darken for ink look
        break;
    }

    const newRgb = hslToRgb(h, s, l);
    return {
      ...p,
      rgb: newRgb,
      hex: rgbToHex(newRgb.r, newRgb.g, newRgb.b)
    };
  });
};
