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
