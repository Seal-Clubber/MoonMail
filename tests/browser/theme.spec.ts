import { test, expect, type Locator } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";

// Theme checks use synthetic read-only mail. No wallet or transaction API is used.
test.beforeEach(async ({ page }) => {
  await page.route("**/deployment.json", (route) =>
    route.fulfill({ json: emptyDeployment }),
  );
});

async function readable(locator: Locator, pseudo: string | null = null) {
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

test("theme keeps utility, parchment and nested dark text readable", async ({
  page,
}) => {
  await page.goto("./");
  for (const selector of [
    ".hero-rule",
    ".mode-legend",
    ".how-it-works p",
    ".empty-hall small",
  ])
    await readable(page.locator(selector).first());
  await page
    .getByRole("button", { name: "Write a letter", exact: true })
    .first()
    .click();
  await readable(
    page.getByLabel("Your letter", { exact: true }),
    "::placeholder",
  );
  await page.getByRole("button", { name: "Public mail", exact: true }).click();
  await page.getByRole("button", { name: "Explore preview" }).click();
  await page
    .getByRole("button", {
      name: "To whoever needs a little light",
      exact: false,
    })
    .click();
  const letter = page.getByRole("dialog");
  await readable(letter.locator(".kicker"));
  await readable(letter.locator(".letter-body"));
  await letter
    .getByRole("button", { name: "Ghost View", exact: false })
    .click();
  await readable(letter.locator(".ghost-view p"));
  await readable(letter.locator(".ghost-view pre"));
  await letter.getByRole("button", { name: "Close letter" }).click();

  // A real rendering path for guest receiving labels; fixtures cannot broadcast.
  const deployment = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    envelopeTemplate: "c".repeat(64),
    indexerUrl: "https://theme-fixture.invalid/",
  };
  const envelope = `component_${"d".repeat(64)}`;
  let writes = 0;
  await page.route("**/deployment.json", (route) =>
    route.fulfill({ json: deployment }),
  );
  await page.route(`${deployment.indexerUrl}**`, (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    const registry = route.request().url().includes(deployment.registry);
    return route.fulfill({
      json: {
        substate: {
          Component: {
            header: {
              template_address: registry
                ? deployment.template
                : deployment.envelopeTemplate,
              owner_rule: "None",
            },
            body: {
              state: registry
                ? [
                    38,
                    { "readable-gift": envelope },
                    {},
                    `template_${deployment.envelopeTemplate}`,
                  ]
                : [
                    38,
                    "readable-gift",
                    0,
                    JSON.stringify({
                      subject: "Readable moonlit gift",
                      body: "Only synthetic display data.",
                    }),
                    "1000000",
                    "100000",
                    false,
                    "5".repeat(64),
                    "",
                    "",
                    "8".repeat(64),
                    "",
                  ],
            },
          },
        },
      },
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Readable moonlit gift", exact: false })
    .click();
  await readable(
    page
      .getByRole("dialog")
      .getByText("Ootle receiving address", { exact: true }),
  );
  await readable(
    page
      .getByRole("dialog")
      .getByText("Existing built-in account component", { exact: true }),
  );
  expect(writes).toBe(0);
});

test("GhostDrop brand stays left with a centered icon and no overflow", async ({
  page,
}) => {
  await page.goto("./");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const brand = page.locator(".topbar .brand");
    await expect(brand).toBeVisible();
    const leftEdge = await page
      .locator(".topbar")
      .evaluate(
        (header) =>
          header.getBoundingClientRect().left +
          parseFloat(getComputedStyle(header).paddingLeft),
      );
    const position = await brand.boundingBox();
    expect(position).not.toBeNull();
    const centered = await page.locator(".brand-icon").evaluate((icon) => {
      const circle = icon.getBoundingClientRect();
      const mark = icon.querySelector("svg")!.getBoundingClientRect();
      return [
        Math.abs(mark.x + mark.width / 2 - circle.x - circle.width / 2),
        Math.abs(mark.y + mark.height / 2 - circle.y - circle.height / 2),
      ];
    });
    expect(centered.every((offset) => offset <= 1)).toBe(true);
    expect(Math.abs(position!.x - leftEdge)).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Connect wallet", exact: true }),
    ).toBeVisible();
    // Exercise the actual connected labels without connecting a wallet. This
    // synthetic DOM case measures layout only; wallet behavior has other tests.
    await page.locator(".wallet-actions").evaluate((actions) => {
      const connect = actions.querySelector(".wallet-button")!;
      const details = document.createElement("button");
      details.className = "wallet-details-button";
      details.textContent = "Wallet details";
      actions.prepend(details);
      connect.lastChild!.textContent = "Disconnect wallet";
    });
    const connectedPosition = await brand.boundingBox();
    expect(Math.abs(connectedPosition!.x - leftEdge)).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Wallet details", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Disconnect wallet", exact: true }),
    ).toBeVisible();
    await page.locator(".wallet-actions").evaluate((actions) => {
      actions.querySelector(".wallet-details-button")!.remove();
      actions.querySelector(".wallet-button")!.lastChild!.textContent =
        "Connect wallet";
    });
  }
});

test("reduced motion freezes atmospheric layers and envelope artwork", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByRole("button", { name: "Explore preview" }).click();
  for (const selector of [
    ".haunting-mist",
    ".haunting-mote",
    ".hero-sigil",
    ".brand-icon svg",
    ".envelope-visual",
    ".ghost-clerk",
  ]) {
    const elements = page.locator(selector);
    expect(await elements.count(), selector).toBeGreaterThan(0);
    for (const element of await elements.all()) {
      const animations = await element.evaluate((node) =>
        [null, "::before", "::after"].map(
          (pseudo) => getComputedStyle(node, pseudo).animationName,
        ),
      );
      expect(animations, selector).toEqual(["none", "none", "none"]);
    }
  }
});
