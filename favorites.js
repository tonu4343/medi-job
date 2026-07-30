window.MEDISPOT_FAVORITES = (function () {
  function buildClient() {
    const config = window.MEDISPOT_SUPABASE || {};
    const configured = config.url && config.anonKey && !config.url.includes("YOUR_PROJECT_ID") && !config.anonKey.includes("YOUR_SUPABASE_ANON_KEY");
    return configured && window.supabase ? window.supabase.createClient(config.url, config.anonKey) : null;
  }

  async function fetchFavoriteIds(supabaseClient, userId) {
    if (!supabaseClient || !userId) return new Set();
    const result = await supabaseClient.from("seeker_favorites").select("job_id").eq("user_id", userId);
    return new Set((result.data || []).map(function (row) { return row.job_id; }));
  }

  async function setFavorite(supabaseClient, userId, jobId, favorited) {
    if (favorited) {
      const result = await supabaseClient.from("seeker_favorites").insert({ user_id: userId, job_id: jobId });
      // 23505 = unique_violation - already favorited (e.g. a double-click race), not a real failure.
      if (result.error && result.error.code !== "23505") throw result.error;
      return;
    }
    const result = await supabaseClient.from("seeker_favorites").delete().eq("user_id", userId).eq("job_id", jobId);
    if (result.error) throw result.error;
  }

  // Wires every .fav-toggle button under `root` (call again after
  // re-rendering a job list). Demo jobs (id starting with "demo-") aren't
  // real rows, so their button is disabled rather than wired. `onToggle`,
  // if given, fires only after the save/remove actually completes (never
  // optimistically) - e.g. seeker-favorites.html uses it to drop the card
  // once a removal is confirmed, rather than racing the async request.
  function wire(root, supabaseClient, userId, favoriteIds, onToggle) {
    root.querySelectorAll(".fav-toggle").forEach(function (btn) {
      const jobId = btn.dataset.jobId;
      if (!jobId || jobId.indexOf("demo-") === 0) { btn.disabled = true; return; }
      btn.classList.toggle("active", favoriteIds.has(jobId));
      btn.addEventListener("click", async function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!supabaseClient || !userId) { window.location.href = "login.html?role=seeker"; return; }
        const nowFavorited = !btn.classList.contains("active");
        btn.disabled = true;
        try {
          await setFavorite(supabaseClient, userId, jobId, nowFavorited);
          btn.classList.toggle("active", nowFavorited);
          if (nowFavorited) favoriteIds.add(jobId); else favoriteIds.delete(jobId);
          if (onToggle) onToggle(jobId, nowFavorited, btn);
        } catch (err) {
          console.error(err);
        }
        btn.disabled = false;
      });
    });
  }

  return { buildClient: buildClient, fetchFavoriteIds: fetchFavoriteIds, setFavorite: setFavorite, wire: wire };
})();
