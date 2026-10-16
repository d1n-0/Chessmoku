import { test, expect } from "@playwright/test";
const place = async (page, name, to) => {
  await page.getByRole("button", { name: new RegExp(`${name} 배치`) }).click();
  await page.locator(`[data-square="${to}"]`).click();
};
test("local placement, selection, five-in-row, undo, reload, reset, keyboard and mobile", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#board button")).toHaveCount(64);
  await expect(page.locator('[data-square="60"]')).toHaveAttribute(
    "aria-label",
    "e1 백 킹",
  );
  await expect(page.locator('[data-square="4"]')).toHaveAttribute(
    "aria-label",
    "e8 흑 킹",
  );
  await expect(page.getByRole("button", { name: /백 킹 배치/ })).toBeDisabled();
  await place(page, "백 폰", 56);
  await place(page, "흑 나이트", 0);
  await page.locator('[data-square="56"]').click();
  await expect(page.locator(".square.target")).toHaveCount(1);
  await page.locator('[data-square="48"]').click();
  await page.getByRole("button", { name: "무르기" }).click();
  await expect(page.locator('[data-square="56"] img')).toHaveCount(1);
  await page.reload();
  await expect(page.locator("#move-count")).toHaveText("2수");
  await place(page, "백 폰", 57);
  await place(page, "흑 나이트", 2);
  await place(page, "백 폰", 58);
  await place(page, "흑 비숍", 6);
  await place(page, "백 폰", 59);
  await expect(page.locator("#result-title")).toHaveText("백 승리!");
  await expect(page.locator(".winning")).toHaveCount(5);
  await page.getByRole("button", { name: "보드 살펴보기" }).click();
  await page.getByRole("button", { name: "무르기" }).click();
  await expect(page.locator(".winning")).toHaveCount(0);
  await page.getByRole("button", { name: "새 대국 시작" }).click();
  await page.locator("#confirm-ok").click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await page.locator('[data-square="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-square="1"]')).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const rulesTab = page.waitForEvent("popup");
  await page.getByRole("link", { name: "규칙", exact: true }).click();
  const rules = await rulesTab;
  await expect(rules).toHaveURL(/\/rules$/);
  await expect(
    rules.getByRole("heading", { name: "규칙", exact: true }),
  ).toBeVisible();
  await expect(rules.locator("body")).toContainText("백 킹은 e1, 흑 킹은 e8");
  await rules.close();
  expect(errors).toEqual([]);
});
test("two browser sessions join a room, move, reconnect, win and agree to rematch", async ({
  browser,
}) => {
  const ac = await browser.newContext(),
    bc = await browser.newContext();
  const a = await ac.newPage(),
    b = await bc.newPage();
  try {
    await a.goto("/");
    await b.goto("/");
    await a.getByRole("button", { name: "온라인 친선전", exact: true }).click();
    await a.getByRole("button", { name: "친선전 방 만들기" }).click();
    await expect(a.locator("#copy-code")).toHaveText(/^[A-Z2-9]{6}$/);
    const code = await a.locator("#copy-code").textContent();
    await expect(a.getByRole("button", { name: /백 룩 배치/ })).toBeDisabled();
    await b.getByRole("button", { name: "온라인 친선전", exact: true }).click();
    await b.getByLabel("6자리 방 코드").fill(code);
    await b.getByRole("button", { name: "입장", exact: true }).click();
    await expect(a.locator("#connection")).toContainText("연결됨");
    await expect(b.locator("#connection")).toContainText("나는 흑");
    await place(a, "백 룩", 0);
    await expect(b.locator('[data-square="0"] img')).toHaveCount(1);
    await expect(b.getByRole("button", { name: /흑 킹 배치/ })).toBeDisabled();
    await place(b, "흑 폰", 63);
    await expect(a.locator('[data-square="63"] img')).toHaveCount(1);
    await b.reload();
    await expect(b.locator("#connection")).toContainText("나는 흑");
    await expect(a.locator("#connection")).toContainText("연결됨");
    await a.locator('[data-square="0"]').click();
    await a.locator('[data-square="4"]').click();
    await expect(a.locator("#result-title")).toHaveText("백 승리!");
    await expect(b.locator("#result-title")).toHaveText("백 승리!");
    await a.getByRole("button", { name: "다시 대국하기" }).click();
    await expect(a.locator("#status-detail")).toContainText("재대국 요청 중");
    await b.getByRole("button", { name: "다시 대국하기" }).click();
    await expect(a.locator("#move-count")).toHaveText("0수");
    await expect(b.locator("#move-count")).toHaveText("0수");
    await expect(a.locator('[data-square="4"]')).toHaveAttribute(
      "aria-label",
      "e8 흑 킹",
    );
    await expect(b.locator('[data-square="60"]')).toHaveAttribute(
      "aria-label",
      "e1 백 킹",
    );
    await a.getByRole("button", { name: "기권", exact: true }).click();
    await a.locator("#confirm-ok").click();
    await expect(b.locator("#result-title")).toHaveText("흑 승리!");
  } finally {
    await ac.close();
    await bc.close();
  }
});

test("legacy local games restore without overwriting pieces and new games use placed kings", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "five-crown-local",
      JSON.stringify({
        history: [
          { kind: "place", type: "q", to: 60 },
          { kind: "place", type: "k", to: 7 },
        ],
        result: null,
      }),
    ),
  );
  await page.reload();
  await expect(page.locator('[data-square="60"]')).toHaveAttribute(
    "aria-label",
    "e1 백 퀸",
  );
  await expect(page.locator('[data-square="7"]')).toHaveAttribute(
    "aria-label",
    "h8 흑 킹",
  );
  await expect(page.locator("#move-count")).toHaveText("2수");
  await page.getByRole("button", { name: "새 대국 시작" }).click();
  await page.locator("#confirm-ok").click();
  await expect(page.locator('[data-square="60"]')).toHaveAttribute(
    "aria-label",
    "e1 백 킹",
  );
  await expect(page.locator('[data-square="4"]')).toHaveAttribute(
    "aria-label",
    "e8 흑 킹",
  );
  await expect(page.getByRole("button", { name: /백 킹 배치/ })).toBeDisabled();
});

test("waiting player watches reserves, reconnects and takes a vacated seat", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [white, black, waiting] = pages;
  const errors = [];
  pages.forEach((page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  try {
    for (const page of pages) {
      await page.goto("/");
      await page
        .getByRole("button", { name: "온라인 친선전", exact: true })
        .click();
    }
    await white.getByRole("button", { name: "친선전 방 만들기" }).click();
    await expect(white.locator("#copy-code")).toHaveText(/^[A-Z2-9]{6}$/);
    const code = await white.locator("#copy-code").textContent();
    for (const page of [black, waiting]) {
      await page.getByLabel("6자리 방 코드").fill(code);
      await page.getByRole("button", { name: "입장", exact: true }).click();
    }
    await expect(waiting.locator("#queue-status")).toHaveText("대기 1번");
    await expect(white.locator("#queue-status")).toHaveText("대기 1명");
    await expect(waiting.locator("#resign")).toBeDisabled();
    await expect(waiting.locator("#reserves button:enabled")).toHaveCount(0);
    await expect(white.locator("#opponent-reserves")).toHaveAttribute(
      "class",
      "opponent-reserves",
    );
    await expect(
      white.locator('#opponent-reserves [data-type="n"]'),
    ).toHaveAttribute("aria-label", "흑 나이트 보관, 2개");
    await expect(white.locator("#opponent-reserves button")).toHaveCount(0);
    await place(white, "백 룩", 0);
    await place(black, "흑 나이트", 8);
    await expect(
      white.locator('#opponent-reserves [data-type="n"]'),
    ).toHaveAttribute("aria-label", "흑 나이트 보관, 1개");
    await white.locator('[data-square="0"]').click();
    await white.locator('[data-square="8"]').click();
    await expect(
      black.locator('#opponent-reserves [data-type="n"]'),
    ).toHaveAttribute("aria-label", "백 나이트 보관, 3개");
    await expect(waiting.locator("#move-count")).toHaveText("3수");
    await waiting.reload();
    await expect(waiting.locator("#queue-status")).toHaveText("대기 1번");
    await black.getByRole("button", { name: "방 나가기", exact: true }).click();
    await black.locator("#confirm-ok").click();
    await expect(waiting.locator("#connection")).toContainText("나는 흑");
    await expect(waiting.locator("#move-count")).toHaveText("0수");
    await expect(white.locator("#queue-status")).toHaveText("대기 0명");
    await place(white, "백 폰", 48);
    await place(waiting, "흑 폰", 16);
    await expect(
      white.locator('#opponent-reserves [data-type="p"]'),
    ).toHaveAttribute("aria-label", "흑 폰 보관, 7개");
    await waiting.setViewportSize({ width: 390, height: 844 });
    expect(
      await waiting.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("compact layout fits common screens and mobile panels preserve controls", async ({
  page,
}) => {
  await page.goto("/");
  for (const [width, height] of [
    [1280, 720],
    [1024, 768],
    [390, 844],
    [375, 667],
    [360, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator("#board")).toBeInViewport();
    await expect(page.locator("#reserves")).toBeInViewport();
    expect(
      await page.evaluate(() => ({
        vertical: document.documentElement.scrollHeight <= innerHeight,
        horizontal: document.documentElement.scrollWidth <= innerWidth,
      })),
    ).toEqual({ vertical: true, horizontal: true });
  }
  await page.locator("#open-mode").click();
  await expect(page.locator("#panel-dialog")).toBeVisible();
  await page.locator("#online-mode").click();
  await page.locator("#create-room").click();
  await expect(page.locator("#panel-dialog")).not.toBeVisible();
  await expect(page.locator("#status-title")).toHaveText("상대 대기 중");
  await page.locator("#open-mode").click();
  await expect(page.locator("#copy-code")).toHaveText(/^[A-Z2-9]{6}$/);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator("#panel-dialog")).not.toBeVisible();
  await expect(page.locator("#mode-slot #copy-code")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.locator("#open-history").click();
  await expect(page.locator("#panel-content #history")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#panel-dialog")).not.toBeVisible();
  await expect(page.locator("#board")).toBeInViewport();
  await page.locator("#open-mode").click();
  await expect(page.locator("#copy-code")).toHaveText(/^[A-Z2-9]{6}$/);
});

test("theme follows system, persists manual choice and syncs the rules page", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "다크 모드", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await place(page, "백 폰", 48);
  await page.getByRole("button", { name: "다크 모드", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#move-count")).toHaveText("1수");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const rules = await context.newPage();
  await rules.goto("/rules");
  await expect(rules.locator("html")).toHaveAttribute("data-theme", "light");
  await rules.getByRole("button", { name: "다크 모드", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(rules.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/dark-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.screenshot({
    path: "test-results/dark-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await rules.close();
});
