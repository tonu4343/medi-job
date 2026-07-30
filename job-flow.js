
(function () {
  const config = window.MEDISPOT_SUPABASE || {};
  const configured = config.url && config.anonKey && !config.url.includes('YOUR_PROJECT_ID') && !config.anonKey.includes('YOUR_SUPABASE_ANON_KEY');
  const supabaseClient = configured && window.supabase ? window.supabase.createClient(config.url, config.anonKey) : null;
  const t = {
    nurse:'スポット看護師', clinic:'新宿メディカルクリニック', nurseCat:'看護師', spot:'スポット', tokyo:'東京都 新宿区', friday:'今週金曜 9:00-17:00', nursePay:'日給 18,000円〜22,000円', nurseDesc:'外来補助、採血、問診、処置準備を担当します。短時間勤務の相談も可能です。', nurseReq:'看護師免許、採血経験', lab:'臨床検査技師', labFacility:'横浜健診センター', contract:'業務委託', kanagawa:'神奈川県 横浜市', weekly:'週1日から相談', labPay:'日給 16,000円〜20,000円', labDesc:'健診における検体検査、生理検査、結果入力を担当します。', labReq:'臨床検査技師免許', radio:'放射線技師', radioFacility:'大阪画像診断クリニック', part:'パート', osaka:'大阪府 大阪市', saturday:'土曜午前', radioDesc:'一般撮影、CT補助、検査前後の患者案内を担当します。', radioReq:'診療放射線技師免許', pt:'理学療法士', ptFacility:'千葉リハビリテーション病院', chiba:'千葉県 美浜区', ptSaturday:'今週土曜 9:00-16:00', ptPay:'日給 18,000円〜22,000円', ptDesc:'入院患者様の歩行訓練、関節可動域訓練、リハビリテーション計画の補助を担当します。', ptReq:'理学療法士免許', match:'マッチ度高', medicalJob:'医療求人', facility:'医療機関', salaryAsk:'給与相談', detail:'詳細を見る', none:'条件に合う求人がありません。条件を変更して検索してください。', count:'件の求人', newBadge:'NEW', detailTitle:'求人詳細', defaultDesc:'業務内容は医療機関と確認します。', appJob:'応募求人', noApps:'まだ応募はありません。求人検索から応募できます。' };
  const demoJobs = [
    { id:'demo-nurse', title:t.nurse, facility_name:t.clinic, category:t.nurseCat, type:t.spot, location:t.tokyo, work_date:t.friday, salary:t.nursePay, description:t.nurseDesc, requirements:t.nurseReq, image:'assets/job-nurse.png' },
    { id:'demo-lab', title:t.lab, facility_name:t.labFacility, category:t.lab, type:t.contract, location:t.kanagawa, work_date:t.weekly, salary:t.labPay, description:t.labDesc, requirements:t.labReq, image:'assets/job-lab.png' },
    { id:'demo-radiology', title:t.radio, facility_name:t.radioFacility, category:t.radio, type:t.part, location:t.osaka, work_date:t.saturday, salary:t.labPay, description:t.radioDesc, requirements:t.radioReq, image:'assets/job-radiology.png' },
    { id:'demo-pt', title:t.pt, facility_name:t.ptFacility, category:t.pt, type:t.spot, location:t.chiba, work_date:t.ptSaturday, salary:t.ptPay, description:t.ptDesc, requirements:t.ptReq, image:'assets/04_physical_therapist_real_photo_512.png' }
  ];
  function esc(v) { return String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  // Salary is free text entered by the employer (e.g. "時給 2,200円〜2,600円"),
  // but some employers just type a bare number like "2200". Only reformat
  // bare numbers into "時給X,XXX円" — anything already containing text
  // (時給/月給/円/a range, etc.) is left exactly as entered.
  function formatSalary(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^[\d,]+$/.test(trimmed)) { return '時給' + Number(trimmed.replace(/,/g, '')).toLocaleString('ja-JP') + '円'; }
    return trimmed;
  }
  function looksSensitive(text) { return /(0\d{1,4}[-−ー－]?\d{1,4}[-−ー－]?\d{3,4})|(\d{10,11})/.test(text) || /(パスワード|password|暗証番号|マイナンバー|口座番号)/i.test(text); }
  function getParam(name) { return new URLSearchParams(location.search).get(name); }
  function localApps() { try { return JSON.parse(localStorage.getItem('medispot_applications') || '[]'); } catch { return []; } }
  function saveLocalApp(app) { const apps = localApps(); apps.unshift(app); localStorage.setItem('medispot_applications', JSON.stringify(apps)); }
  function imageFor(job) { const c = String(job.category || ''); return job.image || (c.includes(t.lab) ? 'assets/job-lab.png' : c.includes(t.radio) ? 'assets/job-radiology.png' : 'assets/job-nurse.png'); }
  function isRecent(job) { if (!job.created_at) return false; const days = (Date.now() - new Date(job.created_at).getTime()) / 86400000; return days >= 0 && days <= 7; }
  const pinIcon = '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/></svg>';
  const clockIcon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.3 2"/></svg>';
  // seeker-jobs.html and job-detail.html are browsable without logging in
  // (see topbarWire below), so ログアウト must stay hidden until a session
  // is actually confirmed - there's nothing to log out of otherwise.
  async function logoutWire() {
    const btn = document.getElementById('logoutButton'); if (!btn) return;
    if (!supabaseClient) return;
    const session = await supabaseClient.auth.getSession();
    if (!session.data.session?.user) return;
    btn.hidden = false;
    btn.addEventListener('click', async () => { await supabaseClient.auth.signOut(); location.href='login.html'; });
  }
  // Pages like seeker-jobs.html are browsable without logging in, so this
  // just fills the sidebar topbar when a session exists and leaves the
  // default placeholder text otherwise - no redirect either way.
  async function topbarWire() {
    const nameEl = document.getElementById('topbarName');
    if (!nameEl || !supabaseClient) return;
    const session = await supabaseClient.auth.getSession();
    const user = session.data.session?.user;
    if (!user) return;
    const profileResult = await supabaseClient.from('seeker_profiles').select('name').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const name = profileResult.data?.name;
    nameEl.textContent = name || '求職者';
    const initialEl = document.getElementById('topbarInitial');
    if (initialEl) initialEl.textContent = (name || '求').trim().charAt(0).toUpperCase() || '求';
  }
  function card(job) {
    const title = esc(job.title || job.category || t.medicalJob);
    const href = 'job-detail.html?id=' + encodeURIComponent(job.id);
    return '<article class="sj-job-card">'
      + '<a class="sj-job-card-link" href="' + href + '" aria-label="' + title + t.detail + '"></a>'
      + '<button class="sj-job-card-save fav-toggle" type="button" data-job-id="' + esc(job.id) + '" aria-label="お気に入りに追加">♡</button>'
      + '<div class="sj-job-card-media"><img src="' + esc(imageFor(job)) + '" alt="">' + (isRecent(job) ? '<span class="sj-badge-new">' + t.newBadge + '</span>' : '') + '</div>'
      + '<div class="sj-job-card-body">'
        + '<div class="sj-job-card-badges"><span class="sj-badge sj-badge-type">' + esc(job.type || t.spot) + '</span><span class="sj-badge sj-badge-match">' + t.match + '</span></div>'
        + '<h3 class="sj-job-card-title">' + title + '</h3>'
        + '<p class="sj-job-card-facility">' + esc(job.facility_name || t.facility) + '</p>'
        + '<div class="sj-job-card-meta">'
          + '<span class="sj-meta-item">' + pinIcon + esc(job.location || '-') + '</span>'
          + '<span class="sj-meta-item">' + clockIcon + esc(job.work_date || '-') + '</span>'
        + '</div>'
        + '<div class="sj-job-card-footer"><div class="sj-job-card-salary">' + esc(formatSalary(job.salary) || t.salaryAsk) + '</div><span class="btn btn-outline sj-job-card-cta">' + t.detail + '</span></div>'
      + '</div>'
      + '</article>';
  }
  async function loadJobsPage() {
    const list = document.getElementById('jobsList'); if (!list) return;
    let jobs = demoJobs;
    if (supabaseClient) { const r = await supabaseClient.from('jobs').select('*').eq('status','open').order('created_at',{ascending:false}); if (!r.error && r.data && r.data.length) jobs = r.data; }
    let currentUserId = null;
    let favoriteIds = new Set();
    if (supabaseClient) {
      const session = await supabaseClient.auth.getSession();
      currentUserId = session.data.session?.user?.id || null;
      if (currentUserId) favoriteIds = await window.MEDISPOT_FAVORITES.fetchFavoriteIds(supabaseClient, currentUserId);
    }
    const render = () => {
      const cat = document.getElementById('category').value; const loc = document.getElementById('location').value; const type = document.getElementById('type').value; const day = document.getElementById('workDate').value;
      const filtered = jobs.filter(j => (!cat || j.category === cat) && (!loc || String(j.location || '').includes(loc)) && (!type || j.type === type) && (!day || String(j.work_date || '').includes(day)));
      document.getElementById('jobCount').textContent = filtered.length + t.count;
      list.innerHTML = filtered.length ? filtered.map(card).join('') : '<div class="sj-jobs-empty">'+t.none+'</div>';
      window.MEDISPOT_FAVORITES.wire(list, supabaseClient, currentUserId, favoriteIds);
    };
    document.getElementById('searchButton').addEventListener('click', render);
    render();
  }
  async function findJob(id, currentUser) {
    if (!id) return demoJobs[0];
    if (id.startsWith('demo-')) return demoJobs.find(j => j.id === id) || demoJobs[0];
    if (!supabaseClient) return demoJobs[0];
    const r = await supabaseClient.from('jobs').select('*').eq('id', id).maybeSingle();
    if (!r.error && r.data) return r.data;
    // The job may have been closed or deleted since this seeker applied — RLS
    // hides non-open jobs from anyone but the posting employer, so the lookup
    // above returns nothing even though the row may still exist. Fall back to
    // the title/facility snapshot already stored on their own application so
    // this doesn't read as a bare, unexplained "not found".
    if (currentUser) {
      const snapshot = await supabaseClient.from('seeker_applications').select('job_title,facility_name').eq('job_id', id).eq('user_id', currentUser.id).maybeSingle();
      if (!snapshot.error && snapshot.data) return { id: id, title: snapshot.data.job_title, facility_name: snapshot.data.facility_name, _closed: true };
    }
    return null;
  }
  function showApplied(app) { const applySection = document.getElementById('applySection'); const appliedSection = document.getElementById('appliedSection'); if (!appliedSection) return; applySection.style.display = 'none'; appliedSection.style.display = 'block'; const statusEl = document.getElementById('appliedStatus'); statusEl.textContent = window.MEDISPOT_STATUS.label(app.status); statusEl.className = 'status ' + window.MEDISPOT_STATUS.cssClass(app.status); const canChat = window.MEDISPOT_STATUS.isChatOpen(app.status); const note = document.getElementById('appliedNote'); const link = document.getElementById('appliedLink'); if (canChat) { note.textContent = '選考が進んでいます。チャットで医療機関とやり取りできます。'; link.textContent = 'メッセージを確認する'; link.href = 'application-chat.html?id=' + encodeURIComponent(app.id); } else { note.textContent = 'この求人にはすでに応募済みです。選考状況は応募管理から確認できます。'; link.textContent = '応募管理を見る'; link.href = 'seeker-applications.html'; } }
  function profileComplete(p) { return !!(p && p.name && p.license && p.birth_date && p.experience_years && p.preferred_style); }
  async function loadDetailPage() {
    const title = document.getElementById('jobTitle');
    if (!title) return;
    let currentUser = null;
    if (supabaseClient) { const session = await supabaseClient.auth.getSession(); currentUser = session.data.session?.user || null; }
    const job = await findJob(getParam('id'), currentUser);
    if (!job) {
      title.textContent = '求人が見つかりません';
      document.getElementById('jobLead').textContent = 'この求人は募集を終了しているか、削除された可能性があります。';
      const layout = document.querySelector('.detail-layout');
      if (layout) layout.style.display = 'none';
      return;
    }
    const isPublicVisitor = !!supabaseClient && !currentUser;

    title.textContent = job.title || t.detailTitle;
    document.getElementById('jobType').textContent = job.type || t.spot;
    document.getElementById('jobSalary').textContent = formatSalary(job.salary) || t.salaryAsk;
    document.getElementById('locationText').textContent = job.location || '-';
    document.getElementById('workDateText').textContent = job.work_date || '-';
    document.getElementById('requirements').textContent = job.requirements || job.category || '-';
    document.getElementById('description').textContent = job._closed ? 'この求人はすでに募集を終了しているため、詳細情報は表示できません。選考状況は下記でご確認いただけます。' : (job.description || t.defaultDesc);
    document.getElementById('confirmJobTitle').textContent = job.title || t.detailTitle;
    document.getElementById('confirmLocation').textContent = job.location || '-';
    document.getElementById('confirmWorkDate').textContent = job.work_date || '-';
    if (isPublicVisitor) {
      document.getElementById('jobLead').textContent = job.location || '';
      document.getElementById('facility').textContent = '登録後に表示されます';
    } else if (job._closed) {
      document.getElementById('jobLead').textContent = (job.facility_name || t.facility) + ' ／ 募集終了';
      document.getElementById('facility').textContent = job.facility_name || t.facility;
    } else {
      document.getElementById('jobLead').textContent = (job.facility_name || t.facility) + ' / ' + (job.location || '');
      document.getElementById('facility').textContent = job.facility_name || t.facility;
    }

    const applyGate = document.getElementById('applyGate');
    const applyIntro = document.getElementById('applyIntro');
    const applyConfirm = document.getElementById('applyConfirm');
    const startButton = document.getElementById('startApplyButton');
    const introMsg = document.getElementById('introMessage');
    const backButton = document.getElementById('backButton');
    const applyComplete = document.getElementById('applyComplete');
    function showIntro() { applyConfirm.style.display = 'none'; applyIntro.style.display = 'block'; }
    function showConfirm() { applyIntro.style.display = 'none'; applyConfirm.style.display = 'block'; }
    function showComplete() { applyIntro.style.display = 'none'; applyConfirm.style.display = 'none'; applyComplete.style.display = 'block'; }
    if (backButton) backButton.addEventListener('click', showIntro);

    if (isPublicVisitor) { applyGate.style.display = 'block'; applyIntro.style.display = 'none'; }

    if (supabaseClient && !String(job.id || '').startsWith('demo-') && currentUser) {
      const existingOnLoad = await supabaseClient.from('seeker_applications').select('id,status').eq('user_id', currentUser.id).eq('job_id', job.id).maybeSingle();
      if (existingOnLoad.data) { showApplied(existingOnLoad.data); return; }
    }

    startButton.addEventListener('click', async () => {
      introMsg.className = 'message'; introMsg.style.display = 'none';
      if (!supabaseClient || String(job.id || '').startsWith('demo-')) { showConfirm(); return; }
      const session = await supabaseClient.auth.getSession();
      const user = session.data.session?.user;
      if (!user) { location.href = 'login.html?role=seeker'; return; }
      startButton.disabled = true; startButton.textContent = '確認しています…';
      const [profileResult, resumeResult] = await Promise.all([
        supabaseClient.from('seeker_profiles').select('name,email,license,birth_date,experience_years,preferred_style').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabaseClient.from('seeker_resumes').select('id').eq('user_id', user.id).maybeSingle()
      ]);
      startButton.disabled = false; startButton.textContent = 'この求人に応募する';
      if (profileResult.error || resumeResult.error) {
        const err = profileResult.error || resumeResult.error;
        introMsg.className = 'message error'; introMsg.style.display = 'block';
        introMsg.textContent = '確認できませんでした：' + (err.message || '不明なエラー');
        return;
      }
      if (!profileComplete(profileResult.data)) {
        introMsg.className = 'message error'; introMsg.style.display = 'block';
        introMsg.textContent = '応募するにはプロフィールの必須項目を入力してください。';
        setTimeout(() => { location.href = 'seeker-profile.html'; }, 1200);
        return;
      }
      if (!resumeResult.data) {
        introMsg.className = 'message error'; introMsg.style.display = 'block';
        introMsg.textContent = '応募するには履歴書を作成してください。';
        setTimeout(() => { location.href = 'seeker-resume.html?returnTo=' + encodeURIComponent(location.href); }, 1200);
        return;
      }
      showConfirm();
    });

    document.getElementById('applyButton').addEventListener('click', async () => {
      const msg = document.getElementById('message');
      const button = document.getElementById('applyButton');
      msg.className = 'message';
      const baseApp = { job_id: job.id, employer_id: job.employer_id || null, job_title: job.title, facility_name: job.facility_name || t.facility, status: 'applied', message: document.getElementById('applyMessage').value.trim(), created_at: new Date().toISOString() };
      if (baseApp.message && looksSensitive(baseApp.message) && !window.confirm('電話番号・住所・パスワードなど、個人情報や機密情報が含まれている可能性があります。\nこのまま送信しますか？')) return;
      if (!supabaseClient || String(job.id || '').startsWith('demo-')) { saveLocalApp(baseApp); showComplete(); return; }
      const session = await supabaseClient.auth.getSession();
      const user = session.data.session?.user;
      if (!user) { location.href = 'login.html?role=seeker'; return; }
      if (window.MEDISPOT_ACCOUNT_GUARD && !(await window.MEDISPOT_ACCOUNT_GUARD.check(supabaseClient, user, 'seeker'))) return;
      button.disabled = true; button.textContent = '応募しています…';
      const [profileResult, resumeResult] = await Promise.all([
        supabaseClient.from('seeker_profiles').select('name,email,license,birth_date,experience_years,preferred_style').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabaseClient.from('seeker_resumes').select('id').eq('user_id', user.id).maybeSingle()
      ]);
      if (profileResult.error || resumeResult.error) {
        button.disabled = false; button.textContent = '応募を確定する';
        const err = profileResult.error || resumeResult.error;
        msg.className = 'message error'; msg.style.display = 'block';
        msg.textContent = '確認できませんでした：' + (err.message || '不明なエラー');
        return;
      }
      if (!profileComplete(profileResult.data) || !resumeResult.data) {
        button.disabled = false; button.textContent = '応募を確定する';
        msg.className = 'message error'; msg.style.display = 'block';
        msg.textContent = 'プロフィールまたは履歴書の内容を確認できませんでした。内容をご確認のうえ、再度お試しください。';
        return;
      }
      const profile = profileResult.data;
      const app = Object.assign({}, baseApp, { user_id: user.id, seeker_name: profile.name || user.user_metadata?.name || '求職者', seeker_email: profile.email || user.email || '', seeker_profession: profile.license || '' });
      const existing = await supabaseClient.from('seeker_applications').select('id,status').eq('user_id', user.id).eq('job_id', job.id).maybeSingle();
      if (existing.data) { button.disabled = false; button.textContent = '応募を確定する'; showApplied(existing.data); return; }
      const result = await supabaseClient.from('seeker_applications').insert(app).select('id').single();
      button.disabled = false; button.textContent = '応募を確定する';
      if (result.error) {
        console.error(result.error);
        if (result.error.code === '23505') {
          const already = await supabaseClient.from('seeker_applications').select('id,status').eq('user_id', user.id).eq('job_id', job.id).maybeSingle();
          if (already.data) { showApplied(already.data); return; }
        }
        msg.className = 'message error'; msg.style.display = 'block';
        msg.textContent = '応募を保存できませんでした：' + (result.error.message || '不明なエラー');
        return;
      }
      showComplete();
    });
  }
  function formatJaDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }); }
  function appDetailRow(label, value) { return value ? '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>' : ''; }
  async function loadApplicationsPage() {
    const list = document.getElementById('applicationsList'); if (!list) return;
    let apps = localApps();
    if (supabaseClient) {
      const session = await supabaseClient.auth.getSession(); const user = session.data.session?.user;
      if (!user && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') { location.href = 'login.html?role=seeker'; return; }
      if (user) {
        const profileResult = await supabaseClient.from('seeker_profiles').select('id,name').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (profileResult.error || !profileResult.data) { await supabaseClient.auth.signOut(); location.href = 'login.html?role=seeker&roleError=1'; return; }
        const topbarName = document.getElementById('topbarName');
        const topbarInitial = document.getElementById('topbarInitial');
        if (topbarName) topbarName.textContent = profileResult.data.name || '求職者';
        if (topbarInitial) topbarInitial.textContent = (profileResult.data.name || '求').trim().charAt(0).toUpperCase() || '求';
        const r = await supabaseClient.from('seeker_applications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (!r.error) apps = r.data || [];
      }
    }
    let jobsById = {};
    const jobIds = [...new Set(apps.map(a => a.job_id).filter(Boolean))];
    if (supabaseClient && jobIds.length) {
      const jobsResult = await supabaseClient.from('jobs').select('id,location,salary,work_date').in('id', jobIds);
      if (!jobsResult.error) jobsById = Object.fromEntries((jobsResult.data || []).map(j => [j.id, j]));
    }
    list.innerHTML = apps.length ? apps.map(a => {
      const canChat = a.id && window.MEDISPOT_STATUS.isChatOpen(a.status);
      const job = jobsById[a.job_id] || {};
      const details = [
        appDetailRow('応募日', formatJaDate(a.created_at)),
        appDetailRow('勤務日', job.work_date),
        appDetailRow('勤務地', job.location),
        appDetailRow('給与', formatSalary(job.salary))
      ].join('');
      const chatHint = !canChat && a.status === 'applied' ? '<span class="chat-hint">選考開始後にメッセージできます</span>' : '';
      return '<article class="job-card"><div class="job-card-main"><span class="status ' + window.MEDISPOT_STATUS.cssClass(a.status) + '">' + esc(window.MEDISPOT_STATUS.label(a.status)) + '</span><h3>' + esc(a.job_title || t.appJob) + '</h3><p class="job-facility">' + esc(a.facility_name || t.facility) + '</p><dl class="app-detail-list">' + details + '</dl></div><div class="job-actions"><a class="btn btn-outline" href="job-detail.html?id=' + encodeURIComponent(a.job_id || '') + '">' + t.detail + '</a>' + (canChat ? '<a class="btn btn-blue" href="application-chat.html?id=' + encodeURIComponent(a.id) + '">メッセージ</a>' : chatHint) + '</div></article>';
    }).join('') : '<div class="panel">' + t.noApps + '</div>';
  }
  logoutWire(); topbarWire(); loadJobsPage(); loadDetailPage(); loadApplicationsPage();
})();
