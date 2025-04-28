import Color from "color";
import { RawHSL, RawRGB } from "./animated-values";

const regex = /(\d+),\s*(\d+),\s*(\d+)/;

/**
 * Converts a hexadecimal color value to an RGBA color string.
 *
 * @param hex - The hex color string (with or without #)
 * @param alpha - The opacity value between 0 and 1
 * @returns An RGBA color string
 * @throws {Error} If the hex color format is invalid
 *
 * @example
 * ```typescript
 * const color = hexToRgba('#ff0000', 0.5); // "rgba(255, 0, 0, 0.5)"
 * ```
 */
export const hexToRgba = (hex: string, alpha: number): string => {
  // Remove the hash at the start if it's there
  const h = hex.replace(/^#/, "");

  // Parse r, g, b values
  let r: number, g: number, b: number;

  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  } else {
    throw new Error("Invalid HEX color.");
  }

  return `rgba(${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)}, ${alpha.toString()})`;
};

/**
 * Converts an RGB color value to an RGBA color string.
 *
 * @param rgb - The RGB color string in format "r, g, b"
 * @param alpha - The opacity value between 0 and 1
 * @returns An RGBA color string
 * @throws {Error} If the RGB color format is invalid
 */
export const rgbToRgba = (rgb: string, alpha: number): string => {
  // Extract r, g, b values
  const result = regex.exec(rgb);
  if (!result) {
    throw new Error("Invalid RGB color.");
  }

  const r = parseInt(result[1]);
  const g = parseInt(result[2]);
  const b = parseInt(result[3]);

  return `rgba(${r.toFixed()}, ${g.toFixed()}, ${b.toFixed()}, ${alpha.toFixed(2)})`;
};

/**
 * Converts an HSL color value to an RGBA color string.
 *
 * @param hsl - The HSL color string in format "h, s, l"
 * @param alpha - The opacity value between 0 and 1
 * @returns An RGBA color string
 * @throws {Error} If the HSL color format is invalid
 */
export const hslToRgba = (hsl: string, alpha: number): string => {
  // Extract h, s, l values
  const result = regex.exec(hsl);
  if (!result) {
    throw new Error("Invalid HSL color.");
  }

  const h = parseInt(result[1]) / 360;
  const s = parseInt(result[2]) / 100;
  const l = parseInt(result[3]) / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = l; // achromatic
    g = l;
    b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let t1 = t;
      if (t1 < 0) t1 += 1;
      if (t1 > 1) t1 -= 1;
      if (t1 < 1 / 6) return p + (q - p) * 6 * t1;
      if (t1 < 1 / 2) return q;
      if (t1 < 2 / 3) return p + (q - p) * (2 / 3 - t1) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return `rgba(${Math.round(r * 255).toFixed(0)}, ${Math.round(g * 255).toFixed(0)}, ${Math.round(b * 255).toFixed(0)}, ${alpha.toString()})`;
};

/**
 * Adds transparency to a color string of any supported format (hex, rgb, hsl).
 *
 * @param color - The color string in hex, RGB, or HSL format
 * @param opacity - The desired opacity value between 0 and 1
 * @returns An RGBA color string
 * @throws {Error} If the color format is not supported
 *
 * @example
 * ```typescript
 * const transparentRed = alpha('#ff0000', 0.5); // "rgba(255, 0, 0, 0.5)"
 * const transparentBlue = alpha('rgb(0, 0, 255)', 0.7); // "rgba(0, 0, 255, 0.7)"
 * ```
 */
export const alpha = (color: string, opacity: number): string => {
  if (color.startsWith("#")) {
    return hexToRgba(color, opacity);
  } else if (color.startsWith("rgb")) {
    return rgbToRgba(color, opacity);
  } else if (color.startsWith("hsl")) {
    return hslToRgba(color, opacity);
  } else {
    throw new Error("Unsupported color format.");
  }
};

// Usage examples:
// console.log(alpha("#3498db", 0.5)); // "rgba(52, 152, 219, 0.5)"
// console.log(alpha("rgb(52, 152, 219)", 0.5)); // "rgba(52, 152, 219, 0.5)"
// console.log(alpha("hsl(204, 70%, 53%)", 0.5)); // "rgba(52, 152, 219, 0.5)"

/**
 * Lightens or darkens a color by a given factor.
 *
 * @param color - The color string to modify
 * @param factor - Positive values lighten the color, negative values darken it
 * @returns A hex color string
 *
 * @example
 * ```typescript
 * const lighterBlue = altColor('#0000ff', 0.2); // Lightens blue by 20%
 * const darkerRed = altColor('#ff0000', -0.3); // Darkens red by 30%
 * ```
 */
export function altColor(color: string, factor: number): string {
  if (factor > 0) {
    return Color(color).lighten(factor).hex() as string;
  } else {
    return Color(color)
      .darken(-1 * factor)
      .hex() as string;
  }
}

export function hexToRgbArray(color: string): [number, number, number] {
  const c = Color(color);
  return [c.red(), c.green(), c.blue()];
}

export function rawRGBToHex({ r, g, b }: RawRGB): string {
  return Color({ r, g, b }).hex() as string;
}

export function rawHSLToHex({ h, s, l }: RawHSL): string {
  return Color({ h, s, l }).hex() as string;
}
