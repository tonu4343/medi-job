import {
  test,
  expect,
  uniqueEmail,
  findUserIdByEmail,
  deleteUser,
  findJobIdByTitle,
  findApplication,
  TEST_SUPABASE_SERVICE_ROLE_KEY
} from "./fixtures.js";

// Covers the core money-path flow this project depends on: an employer
// posts a job, a seeker completes their profile/resume and applies, and
// the resulting application row actually lands in the database with the
// right shape. The job lookup uses a direct DB query (service role key)
// rather than clicking through the search UI, which sits behind a
// whole-card overlay link and is a worse fit for a reliable test than a
// plain id lookup - every user-facing action is still driven through
// the real UI.
test.describe("Job posting and application", () => {
  test.skip(!TEST_SUPABASE_SERVICE_ROLE_KEY, "requires TEST_SUPABASE_SERVICE_ROLE_KEY to look up the job/application rows");

  let employerEmail;
  let seekerEmail;
  const password = "testpass123";
  const jobTitle = "E2Eテスト求人 " + Date.now();

  test.afterEach(async () => {
    const employerId = employerEmail && (await findUserIdByEmail(employerEmail));
    if (employerId) await deleteUser(employerId);
    const seekerId = seekerEmail && (await findUserIdByEmail(seekerEmail));
    if (seekerId) await deleteUser(seekerId);
  });

  test("seeker can complete their profile and apply to an employer's job", async ({ page }) => {
    employerEmail = uniqueEmail("employer-flow");
    seekerEmail = uniqueEmail("seeker-flow");

    // --- Employer: register (or log in, if email confirmation is on for
    // this Supabase project and registration didn't yield a session), then post a job ---
    await page.goto("/register-employer.html");
    await page.locator("#name").fill("佐藤 花子");
    await page.locator("#facilityName").fill("E2Eテストクリニック");
    await page.locator("#address").fill("東京都渋谷区1-2-3");
    await page.locator("#email").fill(employerEmail);
    await page.locator("#password").fill(password);
    await page.locator("#passwordConfirm").fill(password);
    await page.locator('input[type="checkbox"]').check();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/(employer-job-new\.html\?registered=1|login\.html)/, {
      timeout: 10000
    });

    if (!page.url().includes("employer-job-new")) {
      await page.locator("#email").fill(employerEmail);
      await page.locator("#password").fill(password);
      await page.locator("form#loginForm button[type='submit']").click();
      await expect(page).toHaveURL(/employer-dashboard\.html/, { timeout: 10000 });
      await page.goto("/employer-job-new.html");
    }

    await page.locator("#title").fill(jobTitle);
    await page.locator("#category").selectOption("看護師");
    await page.locator("#type").selectOption("スポット");
    await page.locator("#salary").fill("時給 2,200円〜2,600円");
    await page.locator("#location").fill("東京都渋谷区");
    await page.locator("#workDate").fill("月〜金 応相談");
    await page.locator("#submitButton").click();
    await page.locator("#publishButton").click();
    await expect(page).toHaveURL(/employer-dashboard\.html/, { timeout: 10000 });

    const jobId = await findJobIdByTitle(jobTitle);
    expect(jobId).toBeTruthy();

    // --- Seeker: register, log in (registration never auto-authenticates
    // a seeker - it always lands on login.html), complete profile + resume, then apply ---
    await page.goto("/register-seeker.html");
    await page.locator("#lastName").fill("山田");
    await page.locator("#firstName").fill("太郎");
    await page.locator("#email").fill(seekerEmail);
    await page.locator("#password").fill(password);
    await page.locator("#passwordConfirm").fill(password);
    await page.locator('input[type="checkbox"]').check();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/login\.html/, { timeout: 10000 });

    await page.locator("#email").fill(seekerEmail);
    await page.locator("#password").fill(password);
    await page.locator("form#loginForm button[type='submit']").click();
    await expect(page).toHaveURL(/seeker-dashboard\.html/, { timeout: 10000 });

    await page.goto("/seeker-profile.html");
    await page.locator('#licenseGrid label:has-text("看護師") input').check();
    await page.locator("#experience").selectOption("3-5年未満");
    await page.locator("#birthDate").fill("1995-01-01");
    await page.locator("#seekerProfileForm button[type='submit']").click();
    await expect(page.locator("#formMessage")).toContainText("保存", { timeout: 10000 });

    await page.goto("/seeker-resume.html");
    await page.locator("#resumeForm button[type='submit']").click();
    await expect(page.locator("#formMessage")).toContainText("保存", { timeout: 10000 });

    await page.goto("/job-detail.html?id=" + jobId);
    await page.locator("#startApplyButton").click();
    await page.locator("#applyButton").click();
    await expect(page.locator("#applyComplete")).toBeVisible({ timeout: 10000 });

    const seekerId = await findUserIdByEmail(seekerEmail);
    const application = await findApplication(jobId, seekerId);
    expect(application).toBeTruthy();
    expect(application.status).toBe("applied");
  });
});
