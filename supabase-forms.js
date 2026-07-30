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

  function value(id) {
    return document.getElementById(id)?.value?.trim() || null;
  }

  function rawValue(id) {
    return document.getElementById(id)?.value || "";
  }

  function selectedCheckText(container) {
    if (!container) return [];

    return Array.from(container.querySelectorAll(".check-pill input:checked"))
      .map((input) => input.nextElementSibling?.textContent?.trim())
      .filter(Boolean);
  }

  function showMessage(id, text, isError) {
    const message = document.getElementById(id);
    if (!message) return;

    message.textContent = Array.isArray(text) ? text.join("\n") : text;
    message.style.display = "inline";
    message.style.whiteSpace = "pre-line";
    message.style.color = isError ? "#b42318" : "";
  }

  function fieldLabel(el) {
    if (el.type === "checkbox") return "利用規約・プライバシーポリシーへの同意";
    const label = el.closest(".field")?.querySelector("label") || document.querySelector('label[for="' + el.id + '"]');
    return label ? label.textContent.replace(/[\s　]*必須[\s　]*$/, "").trim() : "入力内容";
  }

  function fieldErrorMessage(el) {
    const name = fieldLabel(el);
    if (el.validity.valueMissing) return el.type === "checkbox" ? name + "が必要です。" : name + "を入力してください。";
    if (el.validity.typeMismatch || el.validity.patternMismatch) return "正しい" + name + "を入力してください。";
    if (el.validity.tooShort) return name + "は" + el.minLength + "文字以上で入力してください。";
    return name + "の入力内容を確認してください。";
  }

  function markFieldInvalid(el) {
    el.classList.add("field-invalid");
    if (!el.dataset.fieldErrorBound) {
      el.dataset.fieldErrorBound = "1";
      el.addEventListener("input", function () {
        if (el.checkValidity()) el.classList.remove("field-invalid");
      });
      el.addEventListener("change", function () {
        if (el.checkValidity()) el.classList.remove("field-invalid");
      });
    }
  }

  function collectFormErrors(form) {
    Array.from(form.querySelectorAll(".field-invalid")).forEach((el) => el.classList.remove("field-invalid"));
    const invalidFields = Array.from(form.querySelectorAll(":invalid"));
    invalidFields.forEach(markFieldInvalid);
    return invalidFields.map(fieldErrorMessage);
  }

  function wirePasswordMatch(passwordEl, passwordConfirmEl) {
    if (!passwordEl || !passwordConfirmEl || passwordEl.dataset.matchBound) return;
    passwordEl.dataset.matchBound = "1";
    const clearIfMatching = function () {
      if (passwordEl.value === passwordConfirmEl.value) passwordConfirmEl.classList.remove("field-invalid");
    };
    passwordEl.addEventListener("input", clearIfMatching);
    passwordConfirmEl.addEventListener("input", clearIfMatching);
  }

  function setBusy(form, busy) {
    const button = form.querySelector("button[type='submit']");
    if (!button) return;

    button.disabled = busy;
    button.style.opacity = busy ? "0.7" : "";
    button.style.cursor = busy ? "wait" : "";
  }

  function requireClient() {
    if (supabaseClient) return true;
    showMessage("formMessage", "Supabase URL \u3068 anon key \u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002", true);
    return false;
  }

  function isDuplicateSignup(authData) {
    return Boolean(authData?.user) && Array.isArray(authData.user.identities) && authData.user.identities.length === 0;
  }

  function looksAlreadyRegisteredError(error) {
    const raw = String(error?.message || "").toLowerCase();
    return raw.includes("already registered") || raw.includes("already exists") || raw.includes("user already");
  }

  const ALREADY_REGISTERED_MESSAGE = "このメールアドレスはすでに登録されています。ログインしてください。";

  // signUp() creates the Supabase Auth account before the profile row is
  // ever inserted. If that profile insert then fails (network blip, RLS
  // hiccup, etc.), the account is left stranded: the email is now "already
  // registered" so the form can't be resubmitted, but there's no profile
  // for login to find either. When a duplicate-email signup is detected,
  // try signing in with the same credentials the user just submitted - if
  // that succeeds and no profile exists yet, it's very likely their own
  // orphaned account, so let the caller create the profile now instead of
  // dead-ending. If a profile already exists, this really is an existing
  // account and we sign back out immediately (this form must not silently
  // log someone into their existing dashboard).
  async function tryRecoverOrphanedAccount(email, password, profileTable) {
    const signInResult = await supabaseClient.auth.signInWithPassword({ email, password });
    if (signInResult.error || !signInResult.data?.user) return null;
    const user = signInResult.data.user;
    const existing = await supabaseClient.from(profileTable).select("id").eq("user_id", user.id).limit(1).maybeSingle();
    if (existing.data) {
      await supabaseClient.auth.signOut();
      return { user, profileExists: true, session: null };
    }
    return { user, profileExists: false, session: signInResult.data.session };
  }

  function registrationErrorMessage(error) {
    const raw = String(error?.message || "").toLowerCase();
    if (raw.includes("already registered") || raw.includes("already exists") || raw.includes("user already")) return ALREADY_REGISTERED_MESSAGE;
    if (raw.includes("password") && (raw.includes("short") || raw.includes("weak") || raw.includes("characters"))) return "パスワードは8文字以上で入力してください。";
    if (raw.includes("invalid") && raw.includes("email")) return "正しいメールアドレスを入力してください。";
    if (raw.includes("rate limit") || raw.includes("too many")) return "登録操作が続いています。しばらく時間をおいてからもう一度お試しください。";
    if (raw.includes("network") || raw.includes("fetch")) return "通信エラーが発生しました。インターネット接続を確認して、もう一度お試しください。";
    return "アカウントを登録できませんでした。入力内容を確認して、もう一度お試しください。";
  }

  async function saveSeeker(event) {
    event.preventDefault();

    if (!requireClient()) return;

    const form = event.currentTarget;
    const errors = collectFormErrors(form);

    const password = rawValue("password");
    const passwordConfirm = rawValue("passwordConfirm");
    if (password.length >= 8 && passwordConfirm.length >= 8 && password !== passwordConfirm) {
      errors.push("\u30d1\u30b9\u30ef\u30fc\u30c9\u3068\u78ba\u8a8d\u7528\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u4e00\u81f4\u3057\u307e\u305b\u3093\u3002");
      markFieldInvalid(document.getElementById("passwordConfirm"));
    }

    if (errors.length) {
      showMessage("formMessage", errors, true);
      return;
    }

    setBusy(form, true);

    const email = value("email");
    const name = [value("lastName"), value("firstName")].filter(Boolean).join(" ") || value("name");
    const seekerProfileFields = {
      name,
      email,
      birth_date: value("birth"),
      phone: value("phone"),
      license: value("license"),
      experience_years: value("years"),
      preferred_area: value("area"),
      preferred_style: value("style"),
      skills: selectedCheckText(document.getElementById("skillGrid")),
      pr: value("pr"),
      source_path: window.location.pathname
    };

    // public.handle_new_profile() (a trigger on auth.users) creates the
    // seeker_profiles row in the same transaction as the account, using
    // this metadata - see supabase-schema.sql. If it fails, signUp()
    // itself fails and no account is left behind, so there's nothing
    // left for this client to insert on the normal path.
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: Object.assign({ role: "seeker" }, seekerProfileFields)
      }
    });

    if (authError && !looksAlreadyRegisteredError(authError)) {
      setBusy(form, false);
      console.error(authError);
      showMessage("formMessage", registrationErrorMessage(authError), true);
      return;
    }

    let recoveredSession = null;

    if ((authError && looksAlreadyRegisteredError(authError)) || isDuplicateSignup(authData)) {
      // A pre-existing orphaned account (registered before this trigger
      // existed) may still have no profile row - recover it here.
      const recovery = await tryRecoverOrphanedAccount(email, password, "seeker_profiles");
      if (!recovery || recovery.profileExists) {
        setBusy(form, false);
        showMessage("formMessage", ALREADY_REGISTERED_MESSAGE, true);
        return;
      }
      recoveredSession = recovery.session;
      const { error: profileError } = await supabaseClient
        .from("seeker_profiles")
        .insert(Object.assign({ user_id: recovery.user.id }, seekerProfileFields));
      setBusy(form, false);
      if (profileError) {
        console.error(profileError);
        showMessage("formMessage", "アカウントは作成されましたが、プロフィール保存に失敗しました。" + (profileError.message ? "（" + profileError.message + "）" : ""), true);
        return;
      }
    } else {
      setBusy(form, false);
    }

    const hasSession = Boolean(authData?.session || recoveredSession);
    showMessage("formMessage", hasSession ? "\u767b\u9332\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\u3002\u30ed\u30b0\u30a4\u30f3\u753b\u9762\u3078\u79fb\u52d5\u3057\u307e\u3059\u3002" : "\u767b\u9332\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\u3002\u5c4a\u3044\u305f\u78ba\u8a8d\u30e1\u30fc\u30eb\u3092\u958b\u3044\u3066\u8a8d\u8a3c\u3092\u5b8c\u4e86\u3057\u3066\u304b\u3089\u3001\u30ed\u30b0\u30a4\u30f3\u3057\u3066\u304f\u3060\u3055\u3044\u3002", false);
    // Fire-and-forget: a welcome-email outage must never block or delay
    // the registration flow itself, so this isn't awaited before the redirect.
    fetch("/api/send-welcome-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name })
    }).catch(function (error) { console.error(error); });
    setTimeout(function () {
      window.location.href = "login.html?role=seeker&registered=1" + (hasSession ? "" : "&confirm=1");
    }, 900);
  }

  async function saveEmployer(event) {
    event.preventDefault();

    if (!requireClient()) return;

    const form = event.currentTarget;
    const errors = collectFormErrors(form);

    const password = rawValue("password");
    const passwordConfirmInput = document.getElementById("passwordConfirm");
    const passwordConfirm = passwordConfirmInput ? rawValue("passwordConfirm") : password;
    if (passwordConfirmInput && password.length >= 8 && passwordConfirm.length >= 8 && password !== passwordConfirm) {
      errors.push("パスワードと確認用パスワードが一致しません。");
      markFieldInvalid(passwordConfirmInput);
    }

    if (errors.length) {
      showMessage("formMessage", errors, true);
      return;
    }

    setBusy(form, true);

    const email = value("email");
    const contactName = value("name");
    const facilityName = value("facilityName");
    const employerProfileFields = {
      contact_name: contactName,
      position: value("position"),
      facility_name: facilityName,
      facility_type: value("facilityType"),
      staff_need: value("staffNeed"),
      phone: value("phone"),
      email,
      address: value("address"),
      recruit_styles: selectedCheckText(form),
      note: value("note"),
      source_path: window.location.pathname
    };

    // public.handle_new_profile() (a trigger on auth.users) creates the
    // employer_profiles row in the same transaction as the account, using
    // this metadata - see supabase-schema.sql. If it fails, signUp()
    // itself fails and no account is left behind, so there's nothing
    // left for this client to insert on the normal path.
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: Object.assign({ role: "employer" }, employerProfileFields)
      }
    });

    let recoveredSession = null;

    if (authError && !looksAlreadyRegisteredError(authError)) {
      setBusy(form, false);
      console.error(authError);
      showMessage("formMessage", registrationErrorMessage(authError), true);
      return;
    }

    if ((authError && looksAlreadyRegisteredError(authError)) || isDuplicateSignup(authData)) {
      // A pre-existing orphaned account (registered before this trigger
      // existed) may still have no profile row - recover it here.
      const recovery = await tryRecoverOrphanedAccount(email, password, "employer_profiles");
      if (!recovery || recovery.profileExists) {
        setBusy(form, false);
        showMessage("formMessage", ALREADY_REGISTERED_MESSAGE, true);
        return;
      }
      recoveredSession = recovery.session;
      const { error: profileError } = await supabaseClient
        .from("employer_profiles")
        .insert(Object.assign({ user_id: recovery.user.id }, employerProfileFields));
      setBusy(form, false);
      if (profileError) {
        console.error(profileError);
        showMessage("formMessage", "アカウントは作成されましたが、施設情報を保存できませんでした。再ログイン後も表示されない場合は運営者へお問い合わせください。", true);
        return;
      }
    } else {
      setBusy(form, false);
    }

    const hasSession = Boolean(authData?.session || recoveredSession);
    showMessage("formMessage", hasSession ? "登録が完了しました。求人作成画面へ移動します。" : "登録が完了しました。届いた確認メールを開いて認証を完了してから、ログインしてください。", false);
    // Fire-and-forget: a welcome-email outage must never block or delay
    // the registration flow itself, so this isn't awaited before the
    // redirect. Only reached once both the account and employer_profiles
    // row are confirmed saved (every earlier failure path returns above).
    fetch("/api/send-employer-welcome-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, contactName, facilityName })
    }).catch(function (error) { console.error(error); });
    setTimeout(function () {
      window.location.href = hasSession ? "employer-job-new.html?registered=1" : "login.html?role=employer&registered=1&confirm=1";
    }, 900);
  }
  async function saveSearch(form) {
    if (!supabaseClient || !form) return;

    const payload = {
      profession: Array.from(form.querySelectorAll('input[name="jobType"]:checked')).map((input) => input.value),
      location: Array.from(form.querySelectorAll('input[name="location"]:checked')).map((input) => input.value),
      work_date: form.querySelector("select")?.value || null,
      source_path: window.location.pathname
    };

    await supabaseClient.from("job_searches").insert(payload);
  }

  document.addEventListener("DOMContentLoaded", function () {
    const seekerForm = document.getElementById("profileForm");
    const employerForm = document.getElementById("employerForm");
    const searchButton = document.querySelector(".search-panel .btn-search");

    if (seekerForm) {
      seekerForm.addEventListener("submit", saveSeeker);
      wirePasswordMatch(document.getElementById("password"), document.getElementById("passwordConfirm"));
    }
    if (employerForm) {
      employerForm.addEventListener("submit", saveEmployer);
      wirePasswordMatch(document.getElementById("password"), document.getElementById("passwordConfirm"));
    }
    if (searchButton) {
      searchButton.addEventListener("click", function (event) {
        saveSearch(event.currentTarget.closest(".search-panel"));
      });
    }
  });
})();
