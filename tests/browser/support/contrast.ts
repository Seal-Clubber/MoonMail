import { expect, type Locator } from "@playwright/test";

export async function readable(locator: Locator, pseudo: string | null = null) {
  await expect(locator).toBeVisible();
  const measured = await locator.evaluate((element, pseudo) => {
    type Color = [number, number, number, number];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    function color(value: string): Color {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const channels = context.getImageData(0, 0, 1, 1).data;
      return [channels[0], channels[1], channels[2], channels[3] / 255];
    }
    function over(front: Color, back: Color): Color {
      const a = front[3];
      return [
        front[0] * a + back[0] * (1 - a),
        front[1] * a + back[1] * (1 - a),
        front[2] * a + back[2] * (1 - a),
        1,
      ];
    }
    function luminance(rgb: Color) {
      const linear = rgb.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }
    // Evaluate every color stop in each rendered CSS gradient, composited with
    // the actual ancestor backgrounds. This covers the darkest parchment stop
    // and translucent panels rather than assuming all backgrounds are solid.
    const ancestors: Element[] = [];
    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    )
      ancestors.unshift(current);
    let backgrounds: Color[] = [[255, 255, 255, 1]];
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor);
      backgrounds = backgrounds.map((background) =>
        over(color(style.backgroundColor), background),
      );
      const image = style.backgroundImage;
      const layers: string[] = [];
      let depth = 0,
        start = 0;
      for (let i = 0; i < image.length; i++) {
        if (image[i] === "(") depth++;
        else if (image[i] === ")") depth--;
        else if (image[i] === "," && depth === 0) {
          layers.push(image.slice(start, i));
          start = i + 1;
        }
      }
      layers.push(image.slice(start));
      for (const layer of layers.reverse()) {
        if (!layer.includes("gradient(")) continue;
        const stops =
          layer.match(/rgba?\([^)]*\)|#[\da-f]{3,8}\b|\btransparent\b/gi) || [];
        if (!stops.length) throw new Error(`Unsupported gradient: ${layer}`);
        const samples = stops.map(color);
        backgrounds = backgrounds.flatMap((background) =>
          samples.map((sample) => over(sample, background)),
        );
      }
    }
    const style = getComputedStyle(element, pseudo);
    const foreground = color(style.color);
    foreground[3] *= Number(style.opacity);
    const ratios = backgrounds.map((background) => {
      const ink = luminance(over(foreground, background));
      const paper = luminance(background);
      return (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05);
    });
    return {
      minimum: Math.min(...ratios),
      foreground: style.color,
      backgrounds,
    };
  }, pseudo);
  expect(measured.minimum, JSON.stringify(measured)).toBeGreaterThanOrEqual(
    4.5,
  );
}
