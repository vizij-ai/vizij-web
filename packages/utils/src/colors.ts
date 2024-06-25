const regex = /(\d+),\s*(\d+),\s*(\d+)/;

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

export const rgbToRgba = (rgb: string, alpha: number): string => {
  // Extract r, g, b values
  const result = regex.exec(rgb);
  if (!result) {
    throw new Error("Invalid RGB color.");
  }

  const r = parseInt(result[1]);
  const g = parseInt(result[2]);
  const b = parseInt(result[3]);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

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

  return `rgba(${Math.round(r * 255).toFixed(0)}, ${Math.round(g * 255).toFixed(0)}, ${Math.round(b * 255).toFixed(0)}, ${alpha.toString()})`;
};

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
