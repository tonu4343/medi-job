(function () {
  const config = window.MEDISPOT_SUPABASE || {};
  const configured =
    config.url &&
    config.anonKey &&
    !config.url.includes("YOUR_PROJECT_ID") &&
    !config.anonKey.includes("YOUR_SUPABASE_ANON_KEY");

  const supabaseClient =
    configured && window.supabase
      ? window.supabase.createClient(config.url, config.anonKey)
      : null;

  const tabs = document.querySelectorAll(".role-tab");
  const roleInput = document.querySelector("#roleInput");
  const submitBtn = document.querySelector(".submit-btn");
  const notice = document.querySelector("#notice");
  const form = document.querySelector("#loginForm");
  const params = new URLSearchParams(window.location.search);
  const oauthDivider = document.querySelector("#oauthDivider");
  const lineLoginButton = document.querySelector("#lineLoginButton");
  const roleTabs = document.querySelector("#roleTabs");
  const roleSwitchLink = document.querySelector("#roleSwitchLink");
  const loginLead = document.querySelector("#loginLead");
  const ROLE_LABEL = { seeker: "求職者", employer: "求人者" };
  const SUPPORT_EMAIL = "support@medical-branch.jp";
  const SUPPORT_LINK_HTML = '<a href="mailto:' + SUPPORT_EMAIL + '" style="color:inherit;text-decoration:underline;font-weight:900;">' + SUPPORT_EMAIL + "</a>";

  function showNotice(html, isError) {
    if (!notice) return;
    notice.innerHTML = html;
    notice.classList.add("show");
    notice.style.color = isError ? "#7c2d12" : "#007a52";
    notice.style.background = isError ? "#fff7ed" : "#ecfdf3";
    notice.style.borderColor = isError ? "#fed7aa" : "#bbf7d0";
  }

  function loginErrorMessage(error) {
    const rawMessage = error?.message || "";
    const message = rawMessage.toLowerCase();

    if (message.includes("email not confirmed") || message.includes("not confirmed")) {
      return "メール認証がまだ完了していません。届いた確認メールを開いてから、もう一度ログインしてください。";
    }

    if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
      return "メールアドレスまたはパスワードが正しくありません。ご確認のうえ、再度お試しください。";
    }

    return rawMessage
      ? "ログインできませんでした。（" + rawMessage + "）"
      : "ログインできませんでした。メールアドレスとパスワードを確認してください。";
  }

  function generateRandomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function setRole(role) {
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.role === role);
    });
    if (roleInput) roleInput.value = role;
    if (submitBtn) submitBtn.classList.toggle("employer", role === "employer");
    // LINE login is seeker-only for now.
    const isSeeker = role !== "employer";
    if (oauthDivider) oauthDivider.hidden = !isSeeker;
    if (lineLoginButton) lineLoginButton.hidden = !isSeeker;
  }

  function setNeutral() {
    // Neither role is presumed correct: both tabs render identically (no
    // .active color) and the form requires an explicit pick before submit.
    tabs.forEach((tab) => tab.classList.remove("active"));
    if (roleInput) roleInput.value = "";
    if (submitBtn) submitBtn.classList.remove("employer");
    if (oauthDivider) oauthDivider.hidden = true;
    if (lineLoginButton) lineLoginButton.hidden = true;
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => setRole(tab.dataset.role)));

  function lockRole(role) {
    setRole(role);
    if (roleTabs) roleTabs.hidden = true;
    if (loginLead) loginLead.textContent = ROLE_LABEL[role] + "としてログインしてください。";
    if (roleSwitchLink) {
      const otherRole = role === "employer" ? "seeker" : "employer";
      roleSwitchLink.textContent = ROLE_LABEL[otherRole] + "としてログインする場合はこちら";
      roleSwitchLink.hidden = false;
      roleSwitchLink.onclick = () => unlockRoles(otherRole);
    }
  }

  function unlockRoles(role) {
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    if (roleTabs) roleTabs.hidden = false;
    if (loginLead) loginLead.textContent = "ログイン種別を選択してください。";
    if (roleSwitchLink) roleSwitchLink.hidden = true;
    setRole(role);
  }

  if (lineLoginButton) {
    lineLoginButton.addEventListener("click", () => {
      try {
        const lineConfig = window.MEDISPOT_LINE || {};
        if (!lineConfig.channelId || lineConfig.channelId.includes("YOUR_LINE_CHANNEL_ID")) {
          showNotice("ただいまLINEログインをご利用いただけません。しばらくしてから再度お試しください。", true);
          return;
        }
        const state = generateRandomId();
        const nonce = generateRandomId();
        sessionStorage.setItem("line_login_state", state);
        const authorizeParams = new URLSearchParams({
          response_type: "code",
          client_id: lineConfig.channelId,
          redirect_uri: lineConfig.redirectUri,
          state: state,
          scope: "profile openid email",
          nonce: nonce
        });
        window.location.href = "https://access.line.me/oauth2/v2.1/authorize?" + authorizeParams.toString();
      } catch (err) {
        console.error(err);
        showNotice("LINEログインを開始できませんでした。しばらくしてから再度お試しください。", true);
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!roleInput.value) {
      showNotice("求職者・求人者のいずれかを選択してからログインしてください。", true);
      return;
    }

    if (!supabaseClient) {
      showNotice("ただいまログインをご利用いただけません。しばらくしてから再度お試しください。", true);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.7";
    submitBtn.style.cursor = "wait";

    const email = document.querySelector("#email").value.trim();
    const password = document.querySelector("#password").value;
    const selectedRole = roleInput.value === "employer" ? "employer" : "seeker";
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = "";
      submitBtn.style.cursor = "";
      console.error(error);
      showNotice(loginErrorMessage(error), true);
      return;
    }

    const profileTable = selectedRole === "employer" ? "employer_profiles" : "seeker_profiles";
    const profileResult = await supabaseClient
      .from(profileTable)
      .select("id, account_status")
      .eq("user_id", data.user.id)
      .limit(1)
      .maybeSingle();

    submitBtn.disabled = false;
    submitBtn.style.opacity = "";
    submitBtn.style.cursor = "";

    if (profileResult.error || !profileResult.data) {
      await supabaseClient.auth.signOut();
      showNotice(
        selectedRole === "employer"
          ? "このメールアドレスは求人者アカウントではありません。求職者としてログインしてください。"
          : "このメールアドレスは求職者アカウントではありません。求人者としてログインしてください。",
        true
      );
      return;
    }

    if (profileResult.data.account_status && profileResult.data.account_status !== "active") {
      await supabaseClient.auth.signOut();
      showNotice(
        profileResult.data.account_status === "withdrawn"
          ? "このアカウントは退会済みです。ご不明な点は" + SUPPORT_LINK_HTML + "までお問い合わせください。"
          : "このアカウントは利用停止されています。詳細は" + SUPPORT_LINK_HTML + "までお問い合わせください。",
        true
      );
      return;
    }

    showNotice("ログインしました。マイページへ移動します。", false);
    setTimeout(function () {
      window.location.href = selectedRole === "seeker" ? "seeker-dashboard.html" : "employer-dashboard.html";
    }, 600);
  });

  const requestedRole = params.get("role") === "employer" ? "employer" : params.get("role") === "seeker" ? "seeker" : null;
  const isRoleError = params.get("roleError") === "1";
  // roleError means the currently logged-in account didn't match the page the
  // user tried to reach, so neither tab is presumed correct - both stay
  // visible, unhighlighted, for the user to pick the right one.
  if (requestedRole && !isRoleError) {
    lockRole(requestedRole);
  } else {
    setNeutral();
  }
  if (params.get("accountStatus") === "suspended") {
    showNotice("このアカウントは利用停止されています。詳細は" + SUPPORT_LINK_HTML + "までお問い合わせください。", true);
  } else if (params.get("accountStatus") === "withdrawn") {
    showNotice("このアカウントは退会済みです。ご不明な点は" + SUPPORT_LINK_HTML + "までお問い合わせください。", true);
  } else if (isRoleError) {
    showNotice("現在ログイン中のアカウントでは、この画面はご利用いただけません。求職者・求人者のうち、正しい種別を選んでログインし直してください。", true);
  } else if (params.get("registered") === "1") {
    showNotice(
      params.get("confirm") === "1"
        ? "登録が完了しました。届いた確認メールを開いて認証を完了してから、ログインしてください。"
        : "登録が完了しました。ログインしてください。",
      false
    );
  }

  // These are one-time signals from a redirect - once applied, drop them so
  // a refresh or bookmark doesn't replay a stale notice or role lock.
  if (params.toString()) {
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  }
})();
