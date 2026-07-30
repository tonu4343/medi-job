import { test, expect, uniqueEmail, findUserIdByEmail, deleteUser } from "./fixtures.js";

test.describe("Seeker registration", () => {
  let email;

  test.afterEach(async () => {
    const userId = email && (await findUserIdByEmail(email));
    if (userId) await deleteUser(userId);
  });

  test("completes registration and lands on the login page", async ({ page }) => {
    email = uniqueEmail("seeker");

    await page.goto("/register-seeker.html");
    await page.locator("#lastName").fill("山田");
    await page.locator("#firstName").fill("太郎");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("testpass123");
    await page.locator("#passwordConfirm").fill("testpass123");
    await page.locator('input[type="checkbox"]').check();
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
    // login.html strips its one-time ?registered=1 etc. params after applying
    // them, so assert on the resulting UI state rather than the URL.
    await expect(page.locator("#notice")).toContainText("登録が完了しました", { timeout: 10000 });
  });

  test("resubmitting the same email after a first success is rejected, not silently re-created", async ({ page }) => {
    email = uniqueEmail("seeker-dup");

    async function submit() {
      await page.goto("/register-seeker.html");
      await page.locator("#lastName").fill("山田");
      await page.locator("#firstName").fill("太郎");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill("testpass123");
      await page.locator("#passwordConfirm").fill("testpass123");
      await page.locator('input[type="checkbox"]').check();
      await page.locator('button[type="submit"]').click();
    }

    await submit();
    await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });

    await submit();
    await expect(page.locator("#formMessage")).toContainText("すでに登録されています", { timeout: 10000 });
  });
});

test.describe("Employer registration", () => {
  let email;

  test.afterEach(async () => {
    const userId = email && (await findUserIdByEmail(email));
    if (userId) await deleteUser(userId);
  });

  test("completes registration and redirects to either job creation or login", async ({ page }) => {
    email = uniqueEmail("employer");

    await page.goto("/register-employer.html");
    await page.locator("#name").fill("佐藤 花子");
    await page.locator("#facilityName").fill("E2Eテストクリニック");
    await page.locator("#address").fill("東京都渋谷区1-2-3");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("testpass123");
    await page.locator("#passwordConfirm").fill("testpass123");
    await page.locator('input[type="checkbox"]').check();
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/(employer-job-new\.html\?registered=1|login\.html)/, {
      timeout: 10000
    });
  });
});
