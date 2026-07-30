import { test, expect, uniqueEmail, findUserIdByEmail, deleteUser, setAccountStatus, TEST_SUPABASE_SERVICE_ROLE_KEY } from "./fixtures.js";

async function registerSeeker(page, email, password) {
  await page.goto("/register-seeker.html");
  await page.locator("#lastName").fill("山田");
  await page.locator("#firstName").fill("太郎");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#passwordConfirm").fill(password);
  await page.locator('input[type="checkbox"]').check();
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });
}

test.describe("Login role protection", () => {
  let email;
  const password = "testpass123";

  test.afterEach(async () => {
    const userId = email && (await findUserIdByEmail(email));
    if (userId) await deleteUser(userId);
  });

  test("a seeker account selecting the employer tab is rejected, not silently logged in", async ({ page }) => {
    email = uniqueEmail("roleprotect");
    await registerSeeker(page, email, password);

    await page.goto("/login.html?role=employer");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("form#loginForm button[type='submit']").click();

    await expect(page.locator("#notice")).toContainText("求人者アカウントではありません", { timeout: 10000 });
    await expect(page).toHaveURL(/login\.html/);
  });
});

test.describe("Suspended account enforcement", () => {
  test.skip(!TEST_SUPABASE_SERVICE_ROLE_KEY, "requires TEST_SUPABASE_SERVICE_ROLE_KEY to suspend the test account directly");

  let email;
  const password = "testpass123";

  test.afterEach(async () => {
    const userId = email && (await findUserIdByEmail(email));
    if (userId) await deleteUser(userId);
  });

  test("a suspended seeker cannot log in", async ({ page }) => {
    email = uniqueEmail("suspend");
    await registerSeeker(page, email, password);

    const userId = await findUserIdByEmail(email);
    expect(userId).toBeTruthy();
    await setAccountStatus("seeker_profiles", userId, "suspended");

    await page.goto("/login.html?role=seeker");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("form#loginForm button[type='submit']").click();

    await expect(page.locator("#notice")).toContainText("利用停止されています", { timeout: 10000 });
    // Must not have been redirected into the dashboard.
    await expect(page).toHaveURL(/login\.html/);
  });
});
