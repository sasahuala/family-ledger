/* 两个人的账本 — 单页 PWA，数据存 WorkBuddy 云服务 */
(function () {
  'use strict';

  /* ---------------- 配置 ---------------- */
  const PUBLIC_CONFIG = {
    endpoint: 'https://expense-ledger-20828.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_REDACTED',
  };

  const cloud = WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: PUBLIC_CONFIG.endpoint,
    oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
    publishableKey: PUBLIC_CONFIG.publishableKey,
  });

  const DEFAULT_EXPENSE = [
    { name: '餐饮美食', icon: '🍜', children: [['外卖', '🥡'], ['买菜', '🥬'], ['超市购物', '🛒'], ['堂食', '🍽️'], ['零食饮料', '🧋'], ['咖啡奶茶', '☕']] },
    { name: '交通出行', icon: '🚇', children: [['地铁公交', '🚌'], ['打车', '🚕'], ['加油', '⛽'], ['停车', '🅿️']] },
    { name: '居家生活', icon: '🏠', children: [['房租', '🏡'], ['水电燃气', '💡'], ['日用百货', '🧻'], ['物业费', '🧾']] },
    { name: '购物', icon: '🛍️', children: [['服饰', '👕'], ['数码', '📱'], ['美妆个护', '💄'], ['家居', '🛋️']] },
    { name: '娱乐休闲', icon: '🎬', children: [['电影', '🎥'], ['旅行', '✈️'], ['游戏', '🎮'], ['健身', '🏃']] },
    { name: '医疗健康', icon: '💊', children: [['门诊', '🏥'], ['药品', '💊'], ['体检', '🩺']] },
    { name: '人情往来', icon: '🎁', children: [['红包', '🧧'], ['礼物', '🎀'], ['请客', '🍻']] },
    { name: '学习成长', icon: '📚', children: [['书籍', '📖'], ['课程', '🎓'], ['订阅会员', '🔖']] },
    { name: '通讯网络', icon: '📶', children: [['话费', '📞'], ['宽带', '🌐']] },
    { name: '其他支出', icon: '📦', children: [] },
  ];
  const DEFAULT_INCOME = [
    { name: '工资', icon: '💰', children: [] },
    { name: '奖金', icon: '🎉', children: [] },
    { name: '兼职收入', icon: '💼', children: [] },
    { name: '投资收益', icon: '📈', children: [] },
    { name: '红包收入', icon: '🧧', children: [] },
    { name: '其他收入', icon: '💵', children: [] },
  ];
  const PALETTE = ['#ff6b35', '#ffb31a', '#2eb872', '#3f9bff', '#9b6bff', '#ff5c8a', '#37c2c9', '#8d8d99', '#e0794b', '#5c7cfa'];

  /* ================= 演示模式 =================
     链接带 ?demo=1 时进入：免登录，预载两个月的模拟账目，
     所有写入只落在本地内存，不碰云端数据库。 */
  const DEMO = new URLSearchParams(location.search).has('demo');
  let demoNextId = -1;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function demoCats() {
    const cats = [];
    let id = 1;
    DEFAULT_EXPENSE.forEach((c) => {
      const pid = id++;
      cats.push({ id: pid, book_id: 1, parent_id: null, name: c.name, kind: 'expense', icon: c.icon, sort_order: pid });
      (c.children || []).forEach(([nm, ic], j) => {
        cats.push({ id: id++, book_id: 1, parent_id: pid, name: nm, kind: 'expense', icon: ic, sort_order: j });
      });
    });
    DEFAULT_INCOME.forEach((c, i) => {
      cats.push({ id: id++, book_id: 1, parent_id: null, name: c.name, kind: 'income', icon: c.icon, sort_order: i });
    });
    return cats;
  }

  function demoEntries(cats) {
    const byName = {};
    cats.forEach((c) => { byName[(c.parent_id ? 's:' : 'p:') + c.name] = c.id; });
    const cid = (name) => byName['s:' + name] || byName['p:' + name];
    const ME = 'demo-me', TA = 'demo-ta';
    const rand = mulberry32(20261109);
    const R = (min, max) => min + rand() * (max - min);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];

    const recipes = [
      { c: '外卖', min: 18, max: 42, notes: ['黄焖鸡', '麻辣烫', '汉堡', '蛋炒饭', '麻辣香锅', '轻食沙拉'], w: [ME, TA] },
      { c: '堂食', min: 25, max: 88, notes: ['和同事吃饭', '面馆', '公司附近小馆', '火锅', '烤肉'], w: [ME, TA] },
      { c: '咖啡奶茶', min: 12, max: 32, notes: ['瑞幸', '喜茶', '星巴克', '蜜雪冰城'], shared: false },
      { c: '零食饮料', min: 5, max: 25, notes: ['便利店', '超市零食', '水果'], shared: false },
      { c: '地铁公交', min: 3, max: 9, notes: ['地铁通勤', '公交'] },
      { c: '打车', min: 18, max: 58, notes: ['加班回家', '雨天打车', '去高铁站'], w: [ME, TA], p: 0.5 },
      { c: '买菜', min: 45, max: 165, notes: ['周末买菜', '菜市场', '盒马'], w: [ME, TA], p: 0.4 },
      { c: '日用百货', min: 25, max: 130, notes: ['纸巾洗衣液', '超市日用', '厨房用品'], w: [ME, TA], p: 0.35 },
      { c: '美妆个护', min: 39, max: 229, notes: ['洗发水', '面膜', '防晒霜'], shared: false, p: 0.2 },
      { c: '服饰', min: 99, max: 429, notes: ['T恤', '卫衣', '牛仔裤', '外套'], shared: false, p: 0.15 },
      { c: '数码', min: 49, max: 299, notes: ['手机壳', '数据线', '充电器'], shared: false, p: 0.12 },
      { c: '电影', min: 39, max: 128, notes: ['电影票', 'IMAX'], w: [ME, TA], p: 0.12 },
      { c: '游戏', min: 6, max: 68, notes: ['游戏月卡', '皮肤'], shared: false, p: 0.18 },
      { c: '订阅会员', min: 15, max: 40, notes: ['视频会员', '音乐会员', '网盘会员'], p: 0.15 },
      { c: '书籍', min: 29, max: 96, notes: ['买书', '电子书'], shared: false, p: 0.1 },
      { c: '药品', min: 15, max: 88, notes: ['感冒药', '肠胃药'], p: 0.08 },
      { c: '红包', min: 100, max: 600, notes: ['给爸妈', '朋友结婚', '随礼'], p: 0.05 },
    ];

    const entries = [];
    let eid = 1;

    function build(ym, upTo) {
      const [y, m] = ym.split('-').map(Number);
      const days = Math.min(new Date(y, m, 0).getDate(), upTo);
      for (let d = 1; d <= days; d++) {
        const dateStr = ym + '-' + pad2(d);
        const add = (catName, amt, note, who, shared, kind) => {
          entries.push({
            id: eid++, book_id: 1, owner_id: ME, owner_name: '花花',
            payer_id: who || ME, payer_name: who === TA ? '阿泽' : '花花',
            amount: Number(Number(amt).toFixed(2)),
            kind: kind || 'expense', category_id: cid(catName),
            note: note || null, spent_on: dateStr,
            is_shared: shared !== false, created_at: dateStr + 'T12:00:00Z',
          });
        };
        /* 每月的固定大项 */
        if (d === 1) add('房租', 3200, '房租', TA, true);
        if (d === 5) add('水电燃气', R(180, 300), '水电燃气', rand() < 0.5 ? ME : TA, true);
        if (d === 8) add('话费', 39, '话费', ME, false);
        if (d === 10) add('工资', 12000, '工资', ME, false, 'income');
        /* 每天随机 1~3 笔日常 */
        const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const r = recipes[Math.floor(rand() * recipes.length)];
          if (r.p !== undefined && rand() > r.p) continue;
          const who = r.w ? r.w[Math.floor(rand() * r.w.length)] : (rand() < 0.55 ? ME : TA);
          add(r.c, R(r.min, r.max), pick(r.notes), who, r.shared !== false);
        }
      }
    }

    build(shiftYm(curYm(), -1), 31);          // 上个月，整月
    build(curYm(), new Date().getDate());     // 本月，到今天
    return entries;
  }

  function startDemo() {
    state.categories = demoCats();
    state.members = [
      { id: 1, book_id: 1, user_id: 'demo-me', display_name: '花花', joined_at: '2026-01-01T00:00:00Z' },
      { id: 2, book_id: 1, user_id: 'demo-ta', display_name: '阿泽', joined_at: '2026-01-02T00:00:00Z' },
    ];
    state.book = { id: 1, name: '我们的账本（演示）', owner_id: 'demo-me', invite_code: '888888' };
    state.books = [state.book];
    state.entries = demoEntries(state.categories).sort((a, b) => b.spent_on.localeCompare(a.spent_on));
    state.session = { user: { id: 'demo-me' } };
    state.myName = '花花';
    state.draft = null;
    state.ready = true;
    state.tab = 'chat';
    render();
  }

  /* ---------------- 工具 ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function ymOf(dateStr) { return String(dateStr).slice(0, 7); }
  function curYm() { return todayStr().slice(0, 7); }
  function monthLabel(ym) {
    const [y, m] = ym.split('-');
    return y + '年' + Number(m) + '月';
  }
  function shiftYm(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }
  function money(n) {
    const v = Number(n) || 0;
    const s = Math.abs(v).toFixed(2);
    const [i, f] = s.split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + f;
  }
  function moneyShort(n) {
    const v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '万';
    return money(v).replace(/\.00$/, '');
  }
  function dayLabel(dateStr) {
    const t = todayStr();
    if (dateStr === t) return '今天';
    const d = new Date(dateStr + 'T00:00:00');
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (dateStr === y.getFullYear() + '-' + pad2(y.getMonth() + 1) + '-' + pad2(y.getDate())) return '昨天';
    const w = '日一二三四五六'[d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + w;
  }
  let toastTimer = null;
  function toast(msg) {
    const old = $('.toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 1900);
  }

  /* ---------------- 状态 ---------------- */
  const state = {
    ready: false,
    session: null,
    books: [],
    book: null,
    categories: [],
    members: [],
    entries: [],
    tab: 'chat',
    month: curYm(),
    listMonth: curYm(),
    listDay: null,
    listWho: 'all',
    listCat: null,
    listKw: null,
    draft: null,
    openCat: null,
    sheet: null,
    chat: [],
    chatBusy: false,
    chatInput: '',
    listening: false,
    login: { code: '', error: '', busy: false },
    myName: '',
  };

  /* 编码登录的会话令牌，存本地实现自动登录 */
  const SESSION_KEY = 'ledger-session-v2';
  function storedSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearStoredSession() { localStorage.removeItem(SESSION_KEY); }

  function newDraft() {
    const me = state.session && state.session.user ? state.session.user.id : null;
    return {
      kind: 'expense',
      amount: '',
      cat1: null,
      cat2: null,
      note: '',
      payer: me,
      shared: true,
      date: todayStr(),
    };
  }

  /* ---------------- 数据层 ---------------- */
  const db = () => cloud.database;

  function myUid() { return state.session && state.session.user ? state.session.user.id : null; }

  function memberName(uid) {
    if (!uid) return '未指定';
    if (uid === myUid()) return state.myName || '我';
    const m = state.members.find((x) => x.user_id === uid);
    return (m && m.display_name) || '对方';
  }

  function catById(id) { return state.categories.find((c) => c.id === id) || null; }

  function catLabel(catId) {
    const c = catById(catId);
    if (!c) return { icon: '📦', name: '未分类', rootId: null };
    const p = c.parent_id ? catById(c.parent_id) : null;
    return { icon: c.icon || (p && p.icon) || '📦', name: p ? p.name + ' · ' + c.name : c.name, rootId: p ? p.id : c.id };
  }

  /* 一笔账是否落在某个分类下：命中分类本身，或命中它下面的二级 */
  function catMatch(categoryId, filterId) {
    if (!filterId) return true;
    if (categoryId === filterId) return true;
    const c = catById(categoryId);
    return !!(c && c.parent_id === filterId);
  }

  /* 备注/分类名里的关键词命中 */
  function kwMatch(e, kw) {
    if (!kw) return true;
    const k = String(kw);
    if ((e.note || '').includes(k)) return true;
    const c = catById(e.category_id);
    if (!c) return false;
    if (c.name.includes(k)) return true;
    const p = c.parent_id ? catById(c.parent_id) : null;
    return !!(p && p.name.includes(k));
  }

  /* ---------------- 成员头像 ----------------
     按入账顺序定角色：建账本的人（第一个成员）用女生头像，加入的人用男生头像。
     两个人在各自手机上看，看到的是同一个人同一个头像，不会因为「谁是当前用户」而变。 */
  const FACE = {
    girl: { bg: '#FFE3ED', ink: '#D2456A', skin: '#FBD8C4' },
    boy: { bg: '#DFEDFB', ink: '#2D6CA6', skin: '#F6D2B6' },
  };

  function girlUid() {
    /* 9999 = 花花，固定用女生头像；演示模式沿用第一个成员 */
    const girl = (state.members || []).find((m) => m.user_id === '9999');
    if (girl) return girl.user_id;
    const first = state.members && state.members[0];
    if (first) return first.user_id;
    return (state.book && state.book.owner_id) || myUid();
  }
  function isGirl(uid) { return !!uid && uid === girlUid(); }
  function personColor(uid) { return (isGirl(uid) ? FACE.girl : FACE.boy).ink; }

  /* 一笔账记在谁头上：支出看谁付的，收入看谁记的 */
  function personOf(e) { return e.payer_id || e.owner_id; }

  function faceSVG(uid, size) {
    const girl = isGirl(uid);
    const c = girl ? FACE.girl : FACE.boy;
    const s = size || 18;
    const hair = girl
      ? `<circle cx="12" cy="10.6" r="5.6" fill="${c.ink}"/>
         <circle cx="5.9" cy="12.7" r="2.3" fill="${c.ink}"/>
         <circle cx="18.1" cy="12.7" r="2.3" fill="${c.ink}"/>`
      : `<circle cx="12" cy="10.9" r="5.6" fill="${c.ink}"/>
         <path d="M10.4 4.7c1.2-1.4 2.8-1.7 4.1-.8-1.4.3-2.1 1-2.5 2z" fill="${c.ink}"/>`;
    const fy = girl ? 12.1 : 12.5;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" style="display:block;flex:0 0 auto;border-radius:50%">
      <circle cx="12" cy="12" r="12" fill="${c.bg}"/>
      ${hair}
      <circle cx="12" cy="${fy}" r="4.3" fill="${c.skin}"/>
      <circle cx="10.3" cy="${fy + 0.1}" r="0.7" fill="${c.ink}"/>
      <circle cx="13.7" cy="${fy + 0.1}" r="0.7" fill="${c.ink}"/>
    </svg>`;
  }

  function faceWrap(uid, size, label) {
    return `<span class="face">${faceSVG(uid, size)}${label ? `<span>${esc(label)}</span>` : ''}</span>`;
  }

  /* ---------------- 汇总 ---------------- */
  function entriesOf(ym, kind) {
    return state.entries.filter((e) => ymOf(e.spent_on) === ym && (!kind || e.kind === kind));
  }

  function totals(list) {
    let inc = 0, exp = 0;
    list.forEach((e) => { if (e.kind === 'income') inc += Number(e.amount); else exp += Number(e.amount); });
    return { inc, exp, net: inc - exp };
  }

  /* 按一级分类聚合，含二级拆分 */
  function aggregateByRoot(list) {
    const roots = new Map();
    list.forEach((e) => {
      const c = catById(e.category_id);
      const root = c ? (c.parent_id ? catById(c.parent_id) : c) : null;
      const rootId = root ? root.id : 0;
      if (!roots.has(rootId)) {
        roots.set(rootId, {
          id: rootId,
          name: root ? root.name : '未分类',
          icon: root ? (root.icon || '📦') : '📦',
          total: 0,
          subs: new Map(),
        });
      }
      const node = roots.get(rootId);
      const amt = Number(e.amount);
      node.total += amt;
      const subKey = c ? (c.parent_id ? c.id : 0) : 0;
      const subName = c && c.parent_id ? c.name : '未细分';
      if (!node.subs.has(subKey)) node.subs.set(subKey, { name: subName, icon: c ? (c.icon || '') : '', total: 0 });
      node.subs.get(subKey).total += amt;
    });
    return Array.from(roots.values()).sort((a, b) => b.total - a.total);
  }

  /* ---------------- 渲染：登录 ---------------- */
  function renderGate() {
    const L = state.login;
    return `<div class="gate">
      <h1>两个人的账本</h1>
      <div class="sub">说一句话就记好，月底看清钱花在哪。</div>
      <div class="field">
        <input id="loginCode" type="tel" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="4 位登录编码" value="${esc(L.code)}" style="text-align:center;letter-spacing:10px;font-size:24px">
      </div>
      <div class="err">${esc(L.error)}</div>
      <button class="btn" data-act="login" ${L.busy ? 'disabled' : ''}>${L.busy ? '进入中…' : '进入账本'}</button>
      <div class="tiny muted" style="margin-top:auto;text-align:center;line-height:1.6">
        每人一个专属编码，输对即进，自动保持登录<br>两个人进的是同一本账
      </div>
    </div>`;
  }

  /* ---------------- 渲染：记账 ---------------- */
  function renderEntry() {
    const d = state.draft;
    const cats1 = state.categories.filter((c) => !c.parent_id && c.kind === d.kind);
    const cat1 = d.cat1 ? catById(d.cat1) : null;
    const subs = cat1 ? state.categories.filter((c) => c.parent_id === cat1.id) : [];
    const amtText = d.amount === '' ? '0.00' : d.amount;
    const other = state.members.find((m) => m.user_id !== myUid());

    const chips = cats1.map((c) => `<button class="chip ${d.cat1 === c.id ? 'on' : ''}" data-act="pick-c1" data-id="${c.id}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('');
    const subChips = subs.length
      ? `<div class="subgrid">${subs.map((c) => `<button class="chip ${d.cat2 === c.id ? 'on' : ''}" data-act="pick-c2" data-id="${c.id}">${esc(c.name)}</button>`).join('')}
           <button class="chip ${d.cat2 === null ? 'on' : ''}" data-act="pick-c2" data-id="0">不细分</button></div>`
      : '';

    return `<div class="seg">
        <button class="${d.kind === 'expense' ? 'on exp' : ''}" data-act="set-kind" data-k="expense">支出</button>
        <button class="${d.kind === 'income' ? 'on inc' : ''}" data-act="set-kind" data-k="income">收入</button>
      </div>
      <div class="amount ${d.kind === 'expense' ? 'exp' : 'inc'}">
        <span class="cur">¥</span><span class="val ${d.amount === '' ? 'zero' : ''}" id="amtVal">${esc(amtText)}</span>
      </div>
      <div class="chipwrap">${chips}</div>
      ${subChips}
      <div class="meta">
        <div class="line">
          <span class="k">备注</span>
          <input id="noteInput" type="text" placeholder="写点什么（可不填）" value="${esc(d.note)}" maxlength="60">
        </div>
        ${
          d.kind === 'expense'
            ? `<div class="line">
                 <span class="k">谁付的</span>
                 <div class="toggle">
                   <button class="${d.payer === myUid() ? 'on' : ''}" data-act="set-payer" data-uid="${esc(myUid())}">${faceWrap(myUid(), 16, state.myName || '我')}</button>
                   ${other ? `<button class="${d.payer === other.user_id ? 'on' : ''}" data-act="set-payer" data-uid="${esc(other.user_id)}">${faceWrap(other.user_id, 16, other.display_name || '对方')}</button>` : ''}
                 </div>
                 <button class="chip ${d.shared ? 'on' : ''}" style="margin-left:auto;height:30px" data-act="toggle-shared">${d.shared ? '共同支出' : '个人支出'}</button>
               </div>`
            : ''
        }
        <div class="line">
          <span class="k">日期</span>
          <input id="dateInput" type="date" value="${esc(d.date)}" max="${todayStr()}">
        </div>
      </div>
      <div style="height:10px"></div>`;
  }

  function renderKeypad() {
    /* 标准计算器九宫格：右侧一列是 ⌫ / C / 保存（保存占两行） */
    return `<div class="keypad">
      <button data-act="key" data-k="7">7</button>
      <button data-act="key" data-k="8">8</button>
      <button data-act="key" data-k="9">9</button>
      <button class="fn" data-act="key" data-k="del" aria-label="退格">⌫</button>
      <button data-act="key" data-k="4">4</button>
      <button data-act="key" data-k="5">5</button>
      <button data-act="key" data-k="6">6</button>
      <button class="fn" data-act="key" data-k="clear" aria-label="清零">C</button>
      <button data-act="key" data-k="1">1</button>
      <button data-act="key" data-k="2">2</button>
      <button data-act="key" data-k="3">3</button>
      <button class="save" data-act="save" style="grid-row: span 2">保存</button>
      <button data-act="key" data-k=".">.</button>
      <button data-act="key" data-k="0" style="grid-column: span 2">0</button>
    </div>`;
  }

  /* ---------------- 渲染：明细 ---------------- */
  function renderList() {
    const ym = state.listMonth;
    const all = entriesOf(ym);
    const byWho = state.listWho === 'all' ? all : all.filter((e) => personOf(e) === state.listWho);
    const list = byWho.filter((e) => (!state.listDay || e.spent_on === state.listDay) && catMatch(e.category_id, state.listCat) && kwMatch(e, state.listKw));
    const t = totals(list);

    const byDay = new Map();
    list.forEach((e) => {
      if (!byDay.has(e.spent_on)) byDay.set(e.spent_on, []);
      byDay.get(e.spent_on).push(e);
    });
    const days = Array.from(byDay.keys()).sort().reverse();

    const groups = days.map((day) => {
      const items = byDay.get(day).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const dayExp = items.filter((e) => e.kind === 'expense').reduce((s, e) => s + Number(e.amount), 0);
      const dayInc = items.filter((e) => e.kind === 'income').reduce((s, e) => s + Number(e.amount), 0);
      const sumText = [dayExp ? '支出 ' + money(dayExp) : '', dayInc ? '收入 ' + money(dayInc) : ''].filter(Boolean).join(' · ');
      return `<div class="daygroup">
        <div class="head"><div class="dl"><span class="dname">${esc(dayLabel(day))}</span><span class="dsum">${esc(sumText || '无收支')}</span></div></div>
        ${items.map((e) => {
          const lab = catLabel(e.category_id);
          const uid = personOf(e);
          const tag = e.kind === 'expense' ? (e.is_shared ? '共同' : '个人') : '收入';
          return `<div class="item" data-act="open-entry" data-id="${e.id}">
            <div class="ico">${esc(lab.icon)}</div>
            <div class="main">
              <div class="t1 ellipsis">${esc(lab.name)}${e.note ? '<span class="muted" style="font-weight:400"> · ' + esc(e.note) + '</span>' : ''}</div>
              <div class="t2">${faceSVG(uid, 16)}<span style="color:${personColor(uid)};font-weight:500">${esc(memberName(uid))}</span><span class="sep">·</span><span>${tag}</span></div>
            </div>
            <div class="amt ${e.kind === 'expense' ? 'exp' : 'inc'}">${e.kind === 'expense' ? '-' : '+'}${money(e.amount)}</div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');

    const filterChips = `<div class="filterrow">
        ${state.members.length > 1
          ? `<button class="chip ${state.listWho === 'all' ? 'on' : ''}" data-act="list-who" data-who="all">全部</button>
             ${state.members.map((m) => `<button class="chip ${state.listWho === m.user_id ? 'on' : ''}" data-act="list-who" data-who="${esc(m.user_id)}">${faceWrap(m.user_id, 17, memberName(m.user_id))}</button>`).join('')}`
          : ''}
        <button class="chip ${state.listCat ? 'on' : ''}" data-act="pick-cat" style="margin-left:auto">${state.listCat ? '🏷 ' + esc(catLabel(state.listCat).name) : '🏷 分类'}</button>
      </div>`;

    const activeFilter = (state.listCat || state.listKw || state.listDay)
      ? `<div class="filterrow">
          <span class="muted tiny" style="align-self:center;flex:0 0 auto">筛选</span>
          ${state.listDay ? `<button class="chip on" data-act="clear-day">${esc(dayLabel(state.listDay))} ✕</button>` : ''}
          ${state.listCat ? `<button class="chip on" data-act="clear-cat">${esc(catLabel(state.listCat).name)} ✕</button>` : ''}
          ${state.listKw ? `<button class="chip on" data-act="clear-kw">“${esc(state.listKw)}” ✕</button>` : ''}
        </div>`
      : '';

    return `<div class="topbar">
        <h2>明细</h2>
        <div class="month-nav">
          <button data-act="list-prev">‹</button>
          <button class="label" data-act="list-cal" aria-label="打开日历">${esc(monthLabel(ym))}</button>
          <button data-act="list-next">›</button>
        </div>
      </div>
      <div class="sum-bar">
        <div><div class="v" style="color:var(--expense)">${money(t.exp)}</div><div class="l">支出</div></div>
        <div><div class="v" style="color:var(--income)">${money(t.inc)}</div><div class="l">收入</div></div>
        <div><div class="v">${money(t.net)}</div><div class="l">结余</div></div>
      </div>
      ${filterChips}
      ${activeFilter}
      ${groups || `<div class="empty">${state.listDay ? '这天还没有记录' : (state.listCat || state.listKw ? '没有符合筛选的记录' : '这个月还没有记录')}<br><span class="small">${state.listDay ? '点上方「' + esc(monthLabel(ym)) + '」换一天，或清除筛选' : (state.listCat || state.listKw ? '换个条件试试' : '去「记一笔」开始吧')}</span></div>`}`;
  }

  /* ---------------- 渲染：总结 ---------------- */
  function donutSVG(items, total) {
    const R = 46, r = 30, cx = 56, cy = 56;
    if (!total) {
      return `<svg class="donut" width="112" height="112" viewBox="0 0 112 112">
        <circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="#f0f0f4" stroke-width="${R - r}"/></svg>`;
    }
    let acc = 0;
    const arcs = items.map((it, i) => {
      const frac = it.total / total;
      const a0 = acc * Math.PI * 2 - Math.PI / 2;
      acc += frac;
      const a1 = acc * Math.PI * 2 - Math.PI / 2;
      const large = frac > 0.5 ? 1 : 0;
      const p = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
      const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1);
      const [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
      const color = it.color || PALETTE[i % PALETTE.length];
      if (frac >= 0.9999) {
        return `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${color}" stroke-width="${R - r}"/>`;
      }
      return `<path d="M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 ${large} 0 ${x3} ${y3} Z" fill="${color}"/>`;
    }).join('');
    return `<svg class="donut" width="112" height="112" viewBox="0 0 112 112">${arcs}</svg>`;
  }

  function trendSVG(months) {
    const W = 320, H = 118, padL = 6, padR = 6, padT = 12, padB = 22;
    const max = Math.max.apply(null, months.map((m) => m.exp).concat([1]));
    const step = (W - padL - padR) / Math.max(1, months.length - 1);
    const xOf = (i) => padL + i * step;
    const yOf = (v) => padT + (H - padT - padB) * (1 - v / max);
    const pts = months.map((m, i) => [xOf(i), yOf(m.exp)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ' L' + xOf(months.length - 1).toFixed(1) + ' ' + (H - padB) + ' L' + padL + ' ' + (H - padB) + ' Z';
    const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#ff6b35"/>`).join('');
    const labels = months.map((m, i) => `<text x="${xOf(i).toFixed(1)}" y="${H - 5}" font-size="10" fill="#8e8e93" text-anchor="middle">${esc(m.label)}</text>`).join('');
    return `<svg class="trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ff6b35" stop-opacity=".22"/>
        <stop offset="100%" stop-color="#ff6b35" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#tg)"/>
      <path d="${line}" fill="none" stroke="#ff6b35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}${labels}
    </svg>`;
  }

  function renderSummary() {
    const ym = state.month;
    const list = entriesOf(ym);
    const t = totals(list);
    const prev = totals(entriesOf(shiftYm(ym, -1)));
    const expList = list.filter((e) => e.kind === 'expense');
    const roots = aggregateByRoot(expList);
    const expTotal = t.exp;
    const colored = roots.map((r, i) => Object.assign({}, r, { color: PALETTE[i % PALETTE.length] }));

    const legend = colored.slice(0, 6).map((r) => `<div class="li">
        <span class="dot" style="background:${r.color}"></span>
        <span class="nm">${esc(r.name)}</span>
        <span class="pc">${expTotal ? Math.round((r.total / expTotal) * 100) : 0}%</span>
      </div>`).join('');

    const catLines = colored.map((r) => {
      const pct = expTotal ? (r.total / expTotal) * 100 : 0;
      const open = state.openCat === r.id;
      const subs = Array.from(r.subs.values()).sort((a, b) => b.total - a.total);
      const subHtml = open && subs.length > 1
        ? `<div class="sub-list">${subs.map((s) => `<div class="si"><span class="nm">${esc(s.name)}</span><span class="money">${money(s.total)}</span></div>`).join('')}</div>`
        : '';
      return `<div class="catline" data-act="toggle-cat" data-id="${r.id}">
        <div class="top">
          <span style="font-size:15px">${esc(r.icon)}</span>
          <span class="nm">${esc(r.name)}</span>
          ${subs.length > 1 ? `<span class="tiny muted" style="flex:0 0 auto;transform:rotate(${open ? '180deg' : '0'});transition:transform .15s">▾</span>` : ''}
          <span class="pc">${pct.toFixed(0)}%</span>
          <span class="money">${money(r.total)}</span>
        </div>
        <div class="bar"><i style="width:${Math.max(pct, 1.5)}%;background:${r.color}"></i></div>
        ${subHtml}
      </div>`;
    }).join('');

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftYm(ym, -i);
      months.push({ ym: m, label: Number(m.split('-')[1]) + '月', exp: totals(entriesOf(m)).exp });
    }
    const trendMax = Math.max.apply(null, months.map((m) => m.exp));
    const trendMin = Math.min.apply(null, months.map((m) => m.exp));
    const deltaText = prev.exp
      ? (t.exp >= prev.exp ? '比上月多 ' : '比上月少 ') + money(Math.abs(t.exp - prev.exp))
      : '上月无记录';

    /* 按人拆分：各自这个月花掉多少，其中共同、个人各多少 */
    const byPerson = state.members.length > 1
      ? state.members.map((m) => {
          const mine = expList.filter((e) => personOf(e) === m.user_id);
          const total = mine.reduce((s, e) => s + Number(e.amount), 0);
          const shared = mine.filter((e) => e.is_shared).reduce((s, e) => s + Number(e.amount), 0);
          return { uid: m.user_id, name: memberName(m.user_id), total, count: mine.length, shared, own: total - shared };
        }).sort((a, b) => b.total - a.total)
      : [];

    const whoNote = byPerson.length === 2
      ? Math.abs(byPerson[0].total - byPerson[1].total) < 0.01
        ? '<div class="who-note">两个人这个月花得一样多</div>'
        : `<div class="who-note">${esc(byPerson[0].name)} 比 ${esc(byPerson[1].name)} 多花 ¥${money(byPerson[0].total - byPerson[1].total)}</div>`
      : '';

    const whoHtml = byPerson.length
      ? `<div class="sect">
          <h3>谁花的钱</h3>
          ${byPerson.map((p) => {
            const pc = expTotal ? (p.total / expTotal) * 100 : 0;
            return `<div class="who-row">
              ${faceSVG(p.uid, 30)}
              <div class="grow">
                <div class="between">
                  <span class="wname">${esc(p.name)}<span class="muted tiny" style="margin-left:6px;font-weight:400">${p.count} 笔 · ${pc.toFixed(0)}%</span></span>
                  <span class="wamt">¥${money(p.total)}</span>
                </div>
                <div class="wbar"><i style="width:${Math.max(pc, 1.5)}%;background:${personColor(p.uid)}"></i></div>
                <div class="tiny muted" style="margin-top:5px">共同 ¥${money(p.shared)} · 个人 ¥${money(p.own)}</div>
              </div>
            </div>`;
          }).join('')}
          ${whoNote}
        </div>`
      : '';

    return `<div class="topbar">
        <h2>总结</h2>
        <div class="month-nav">
          <button data-act="sum-prev">‹</button>
          <span class="label">${esc(monthLabel(ym))}</span>
          <button data-act="sum-next">›</button>
        </div>
      </div>

      <div class="hero">
        <div class="muted small">本月支出</div>
        <div class="big" style="color:var(--expense)">¥${money(t.exp)}</div>
        <div class="small muted" style="margin-top:4px">${esc(deltaText)}</div>
        <div class="tri">
          <div><div class="v" style="color:var(--income)">¥${money(t.inc)}</div><div class="l">收入</div></div>
          <div><div class="v">¥${money(t.net)}</div><div class="l">结余</div></div>
          <div><div class="v">${list.length}</div><div class="l">笔数</div></div>
        </div>
      </div>

      ${whoHtml}

      <div class="sect">
        <h3>支出构成</h3>
        ${expTotal ? `<div class="donut-wrap">${donutSVG(colored, expTotal)}<div class="legend">${legend}</div></div>` : '<div class="muted small">本月还没有支出</div>'}
      </div>

      <div class="sect">
        <h3>分类明细 <span class="muted tiny" style="font-weight:400">点击展开子类</span></h3>
        ${catLines || '<div class="muted small">暂无数据</div>'}
      </div>

      <div class="sect">
        <h3>近 6 个月趋势</h3>
        ${trendMax > 0 ? trendSVG(months) : '<div class="muted small">数据还不够绘制趋势</div>'}
        ${trendMax > 0 ? `<div class="between tiny muted" style="margin-top:6px"><span>最高 ${moneyShort(trendMax)}</span><span>最低 ${moneyShort(trendMin)}</span></div>` : ''}
      </div>

      <div style="height:16px"></div>`;
  }

  /* ---------------- 渲染：我的 ---------------- */
  function renderCatTree() {
    const block = (list, label) => {
      const rows = list.map((c) => {
        const subs = state.categories.filter((x) => x.parent_id === c.id);
        return `<div class="cat-row">
          <div class="cat-top">${c.icon || '📦'} ${esc(c.name)}${subs.length ? `<span class="muted tiny">（${subs.length}）</span>` : ''}</div>
          ${subs.length ? `<div class="cat-subs">${subs.map((s) => `<span class="chip">${s.icon || ''} ${esc(s.name)}</span>`).join('')}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="muted tiny" style="margin:10px 0 6px">${label}</div>${rows}`;
    };
    return block(state.categories.filter((c) => !c.parent_id && c.kind === 'expense'), '支出分类')
      + block(state.categories.filter((c) => !c.parent_id && c.kind === 'income'), '收入分类');
  }

  function renderMe() {
    const b = state.book;
    const others = state.members.filter((m) => m.user_id !== myUid());
    const memberHtml = state.members.map((m) => {
      const isMe = m.user_id === myUid();
      const label = isMe ? (m.display_name || '我') : (m.display_name || '对方');
      return `<div class="member">
        ${faceSVG(m.user_id, 34)}
        <div class="grow">${esc(label)}${isMe ? ' <span class="muted tiny">（我）</span>' : ''}</div>
        ${isMe ? `<button class="chip" style="height:28px;font-size:12px" data-act="rename-me">改名</button>` : ''}
      </div>`;
    }).join('');

    return `<div class="topbar"><h2>我的</h2></div>
      <div class="sect">
        <h3>${esc(b.name)}</h3>
        <div class="kv"><span class="muted">我的编码</span><span class="code">${esc(myUid() || '')}</span></div>
        <div class="tiny muted" style="margin-top:8px">${others.length ? '两个人已就位，账单会自动同步。' : '对方用自己的编码登录后，就能看到同一本账。'}</div>
      </div>

      <div class="sect">
        <h3>成员</h3>
        ${memberHtml}
      </div>

      <div class="sect">
        <h3>分类</h3>
        <div class="muted small" style="margin-bottom:10px">记账和统计都用这些分类</div>
        ${renderCatTree()}
        <button class="btn ghost" style="height:44px;border:1px solid var(--line)" data-act="add-cat">新增一级分类</button>
      </div>

      <div class="sect">
        <h3>账号</h3>
        <div class="kv"><span class="muted">登录方式</span><span>编码登录（自动保持登录）</span></div>
        <button class="btn danger" style="margin-top:12px;height:46px" data-act="logout">退出登录</button>
      </div>
      <div style="height:20px"></div>`;
  }

  /* ---------------- 对话式记账 ---------------- */
  function otherUid() {
    const m = state.members.find((x) => x.user_id !== myUid());
    return m ? m.user_id : null;
  }

  function chatStoreKey() { return (DEMO ? 'demo-' : '') + 'ledger-chat:' + (state.book ? state.book.id : 'none'); }
  function loadChatStore() {
    try {
      const raw = localStorage.getItem(chatStoreKey());
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(-60) : [];
    } catch (e) { return []; }
  }
  function persistChat() {
    try { localStorage.setItem(chatStoreKey(), JSON.stringify(state.chat.slice(-60))); } catch (e) { /* 忽略配额错误 */ }
  }

  function resolveCandidates(ids, kind) {
    const out = [];
    (ids || []).forEach((raw) => {
      const c = catById(Number(raw));
      if (!c) return;
      if (out.some((x) => x.id === c.id)) return;
      const p = c.parent_id ? catById(c.parent_id) : null;
      out.push({ id: c.id, icon: c.icon || (p && p.icon) || '📦', path: p ? p.name + ' · ' + c.name : c.name });
    });
    if (out.length) return out.slice(0, 4);
    return state.categories
      .filter((c) => !c.parent_id && c.kind === (kind || 'expense'))
      .slice(0, 4)
      .map((c) => ({ id: c.id, icon: c.icon || '📦', path: c.name }));
  }

  function cardCatInfo(d) {
    if (!d.category_id) return null;
    const c = catById(d.category_id);
    if (!c) return null;
    const p = c.parent_id ? catById(c.parent_id) : null;
    return { icon: c.icon || (p && p.icon) || '📦', text: p ? p.name + ' · ' + c.name : c.name };
  }

  function renderCard(m, i) {
    const d = m.draft;
    const info = cardCatInfo(d);
    const saved = m.status === 'saved';
    const undone = m.status === 'undone';
    const showChoices = !saved && !undone && !d.category_id && m.cands && m.cands.length;
    const showAll = !!m.showAll;

    const allCats = state.categories
      .filter((c) => !c.parent_id && c.kind === d.kind)
      .map((c) => `<button data-act="pick-cand" data-i="${i}" data-c="${c.id}">${esc(c.icon || '')} ${esc(c.name)}</button>`)
      .join('');

    const choicesHtml = showAll
      ? `<div class="rec-q">所有分类：</div><div class="rec-choices">${allCats}</div>`
      : showChoices
        ? `<div class="rec-q">${esc(m.question || '归到哪一类？')}</div>
           <div class="rec-choices">${m.cands.map((c) => `<button data-act="pick-cand" data-i="${i}" data-c="${c.id}">${esc(c.icon)} ${esc(c.path)}</button>`).join('')}</div>`
        : '';

    const actions = saved
      ? `<div class="rec-actions">
           <button data-act="card-undo" data-i="${i}">撤销</button>
           <button data-act="card-recat" data-i="${i}">改分类</button>
         </div>`
      : undone
        ? ''
        : `<div class="rec-actions">
             <button data-act="card-recat" data-i="${i}">换一个</button>
             ${d.category_id ? `<button class="primary" data-act="pick-cand" data-i="${i}" data-c="${d.category_id}">就这样记</button>` : ''}
           </div>`;

    return `<div class="rec-card ${saved ? 'saved' : ''}">
      <div class="rec-top">
        <span class="rec-amt ${d.kind === 'income' ? 'inc' : ''}">${d.kind === 'income' ? '+' : '-'}${money(d.amount)}</span>
        <span class="rec-kind">${d.kind === 'income' ? '收入' : '支出'}</span>
      </div>
      <div class="rec-meta">
        <span class="rec-tag ${info ? 'hot' : ''}">${info ? esc(info.icon + ' ' + info.text) : '待分类'}</span>
        <span>${esc(d.date === todayStr() ? '今天' : d.date)}</span>
        ${d.kind === 'expense' ? `<span class="face">${faceSVG(d.payer, 14)}<span>${esc(memberName(d.payer))}付</span></span>` : ''}
        ${d.kind === 'expense' ? `<span>${d.shared ? '共同' : '个人'}</span>` : ''}
        ${saved ? '<span style="color:var(--income);font-weight:600">已记录</span>' : ''}
        ${undone ? '<span class="muted">已撤销</span>' : ''}
      </div>
      ${d.note ? `<div class="rec-note">${esc(d.note)}</div>` : ''}
      ${choicesHtml}
      ${actions}
    </div>`;
  }

  function renderAnswer(m, i) {
    const r = m.res;
    if (!r) return '';
    const bars = r.topCats && r.topCats.length
      ? `<div class="ans-bars">${r.topCats.map((c) => `<div class="ans-bar">
           <span class="nm ellipsis">${esc(c.name)}</span>
           <span class="track"><i style="width:${Math.max(c.pct, 2)}%"></i></span>
           <span class="pc">${c.pct.toFixed(0)}%</span>
         </div>`).join('')}</div>`
      : '';
    const rows = r.topEntries && r.topEntries.length
      ? `<div class="ans-list">
           <div class="ans-sub">${r.count > 3 ? '金额最高的几笔' : '这几笔'}</div>
           ${r.topEntries.map((e) => `<div class="ans-row">
             ${faceSVG(e.uid, 14)}
             <span class="nm ellipsis">${esc(e.label)}</span>
             <span class="dt">${esc(e.date)}</span>
             <span class="amt">¥${money(e.amount)}</span>
           </div>`).join('')}
         </div>`
      : '';
    return `<div class="rec-card ans">
      <div class="ans-head">${esc(r.head)}</div>
      ${r.compare ? `<div class="ans-cmp">${esc(r.compare)}</div>` : ''}
      ${r.count ? `<div class="ans-stats"><span><b>${r.count}</b> 笔</span><span>均价 ¥${money(r.avg)}</span><span>${r.days} 天</span></div>` : ''}
      ${bars}${rows}
      ${r.count ? `<div class="rec-actions"><button class="primary" data-act="ans-list" data-i="${i}">看明细</button></div>` : ''}
    </div>`;
  }

  function renderChat() {
    const intro = `<div class="chat-intro">
      <b>直接说一句就行。</b><br>
      记账：「买水 5 块」「昨天打车 28」「外卖 32，他付的」。<br>
      也能问：「这个月餐饮花了多少」「外卖哪几笔最贵」「上个月一共花了多少」。
    </div>`;
    const items = state.chat.map((m, i) => {
      if (m.role === 'user') {
        const imgs = m.imgs || (m.img ? [m.img] : []);
        return `<div class="bubble user">${imgs.map((s) => `<img class="bubble-img" src="${s}" alt="账单图片">`).join('')}${m.text ? `<div>${esc(m.text)}</div>` : ''}</div>`;
      }
      if (m.role === 'card') return renderCard(m, i);
      if (m.role === 'bill') return renderBillCard(m, i);
      if (m.role === 'answer') return renderAnswer(m, i);
      return `<div class="bubble bot ${m.warn ? 'warn' : ''}">${esc(m.text)}</div>`;
    }).join('');

    return `<div class="topbar">
        <h2>说说</h2>
        ${state.chat.length ? '<button class="chip" style="height:30px;font-size:12px" data-act="chat-clear">清空</button>' : '<span></span>'}
      </div>
      <div class="chat">
        ${state.chat.length ? '' : intro}
        ${items}
        ${state.chatBusy ? '<div class="bubble bot dots"><span></span><span></span><span></span></div>' : ''}
      </div>`;
  }

  function renderComposer() {
    return `<div class="composer">
      <button class="mic ${state.listening ? 'rec' : ''}" data-act="mic" aria-label="语音输入">🎤</button>
      <button class="cam" data-act="camera" aria-label="识别账单图片">📷</button>
      <input id="chatInput" type="text" placeholder="${state.listening ? '正在听…再点一下结束' : '说一句，或直接打字'}" value="${esc(state.chatInput)}">
      <button class="send" data-act="chat-send" ${state.chatBusy ? 'disabled' : ''}>发送</button>
      <input id="billFile" type="file" accept="image/*" multiple hidden>
    </div>
    ${state.listening ? '<div class="rec-hint" data-act="mic"><span class="pulse"></span>正在听…点这里结束</div>' : ''}`;
  }

  /* --------- 模型解析 --------- */
  let modelCache = null;
  async function getModel() {
    if (modelCache) return modelCache;
    const list = await cloud.llm.models.list();
    const m = (list || []).find((x) => x.disabled !== true);
    if (!m) throw new Error('没有可用模型');
    modelCache = m;
    return m;
  }

  function buildParseSystem() {
    const cats = state.categories.map((c) => {
      const p = c.parent_id ? catById(c.parent_id) : null;
      return { id: c.id, kind: c.kind, path: p ? p.name + '/' + c.name : c.name };
    });
    const me = state.myName || '我';
    const other = memberName(otherUid()) || '对方';
    return [
      '你是一个中文记账解析器。用户会用一句口语描述一笔消费或收入，你把它转换成一条结构化记录。',
      '只输出一个 JSON 对象，不要输出 markdown 代码块、不要任何解释文字。',
      '',
      '今天是 ' + todayStr() + '。当前用户是「' + me + '」，另一位成员是「' + other + '」。',
      '',
      '可用分类（JSON 数组，id 是分类编号，path 是层级路径）：',
      JSON.stringify(cats),
      '',
      '严格按此结构输出：',
      '{"ok":true,"amount":5,"kind":"expense","category_id":45,"candidates":[],"note":"买了一瓶水","date":"' + todayStr() + '","payer":"me","shared":true,"confidence":0.92,"reply":"记好了"}',
      '',
      '字段规则：',
      '1. ok：false 表示没听懂或不是记账，此时 amount 为 null，reply 用一句话反问关键信息。',
      '2. amount：纯数字，单位元。「五块」→5，「12.5」→12.5，「一百二」→120。没提金额则 null。',
      '3. kind：expense 或 income。多数情况是 expense；「发工资」「收到」「报销到账」才是 income。',
      '4. category_id：只能取上面列表里出现过的 id，禁止编造。二级分类比一级更贴合时给二级。',
      '5. candidates：当你只有 60%~85% 把握、或有 2~4 个分类都说得通时，category_id 给 null，candidates 按可能性从高到低列出 2~4 个 id；把握 ≥85% 时 category_id 给值、candidates 给空数组。',
      '6. note：不超过 12 个字，保留商品或场景关键词，不要重复金额。',
      '7. date：YYYY-MM-DD。「昨天」要换算成具体日期，不能晚于今天，没提就用今天。',
      '8. payer：用户说「对方付的」「他付的」给 "other"；说「我付的」给 "me"；没提给 null。',
      '9. shared：默认 true（共同支出）；用户说「我自己花的」「个人的」给 false。',
      '10. confidence：0 到 1 的小数。',
      '11. reply：给用户看的一句话，口语，不超过 20 字。识别成功说「记好了」之类，不确定时说明你在问什么。',
      '12. 最重要的规则：只解析最后一条用户消息。历史消息只用于理解口语指代（如「再来一笔」「也是奶茶」），严禁从历史消息里复制金额、分类、日期或备注，所有字段只能来自最后这条消息本身。',
    ].join('\n');
  }

  function parseJsonLoose(s) {
    if (!s) return null;
    let t = String(s).trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i >= 0 && j > i) t = t.slice(i, j + 1);
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  async function parseByLLM(text) {
    const model = await getModel();
    const history = state.chat
      .slice(0, Math.max(0, state.chat.length - 1))
      .filter((m) => m.role === 'user' || (m.role === 'bot' && !m.warn))
      .slice(-4)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

    const messages = [
      { role: 'system', content: buildParseSystem() },
      ...history,
      { role: 'user', content: text },
    ];

    let out = '';
    for await (const chunk of cloud.llm.chat.completions.create({
      model: model.id,
      messages,
      stream: true,
      temperature: 0.1,
    })) {
      const delta = chunk.choices[0] && chunk.choices[0].delta;
      if (delta && delta.content) out += delta.content;
    }
    return parseJsonLoose(out);
  }

  /* ================= 图片账单识别 =================
     发一张账单/小票/订单截图 → 视觉模型逐笔提取 → 用户核对后批量入账 */
  function readImage(file, maxEdge, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * scale));
          c.height = Math.max(1, Math.round(img.naturalHeight * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      img.src = url;
    });
  }

  function buildBillSystem() {
    const cats = state.categories.map((c) => {
      const p = c.parent_id ? catById(c.parent_id) : null;
      return { id: c.id, kind: c.kind, path: p ? p.name + '/' + c.name : c.name };
    });
    return [
      '你是账单图片识别器。用户发来一张账单、小票、订单截图或消费记录照片，你提取其中的记账信息。',
      '只输出一个 JSON 对象，不要 markdown 代码块、不要解释文字。',
      '',
      '今天是 ' + todayStr() + '。',
      '',
      '可用分类（JSON 数组，id 是分类编号）：',
      JSON.stringify(cats),
      '',
      '输出结构：',
      '{"ok":true,"items":[{"amount":12,"kind":"expense","category_id":45,"note":"番茄","date":"' + todayStr() + '","payer":null,"shared":true,"confidence":0.9}],"reply":"认出了 3 笔"}',
      '',
      '识别规则：',
      '1. 图片里每一条消费明细都拆成独立一笔；「单价 × 数量」记小计金额，note 里保留商品名。',
      '2. 如果只有总价没有逐项明细（比如只有「合计 ¥58」），就记一笔，note 写账单场景（如「超市购物」）。',
      '3. amount：该笔的实付小计，纯数字。kind：expense 或 income（退款到账、收入类票据才给 income）。',
      '4. category_id：只能取上面列表的 id；说不准就按最常见用途给，不要编造 id。',
      '5. date：优先取图片里的订单时间/消费日期（YYYY-MM-DD）；取不到用今天；不能晚于今天。',
      '6. payer：图片看不出谁付的，一律 null。shared：普通消费给 true。',
      '7. confidence：0~1。字迹模糊、看不清的项要降低并尽量给最接近的值。',
      '8. 图片里不是账单/消费记录（聊天截图、风景照等）→ ok:false，reply 说明原因。',
      '9. items 最多 20 笔；reply 一句话，不超过 20 字。',
    ].join('\n');
  }

  async function parseBillByLLM(dataUrl) {
    const model = await getModel();
    const messages = [
      { role: 'system', content: buildBillSystem() },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: '请识别这张图片里的账单信息并逐笔输出。' },
        ],
      },
    ];
    let out = '';
    for await (const chunk of cloud.llm.chat.completions.create({
      model: model.id,
      messages,
      stream: true,
      temperature: 0.1,
    })) {
      const delta = chunk.choices[0] && chunk.choices[0].delta;
      if (delta && delta.content) out += delta.content;
    }
    return parseJsonLoose(out);
  }

  function normalizeBillItem(it) {
    const amount = Number(it && it.amount);
    if (!isFinite(amount) || amount <= 0) return null;
    const kind = it.kind === 'income' ? 'income' : 'expense';
    let cid = it.category_id ? Number(it.category_id) : null;
    if (cid && !catById(cid)) cid = null;
    let date = /^\d{4}-\d{2}-\d{2}$/.test(it.date || '') ? it.date : todayStr();
    if (date > todayStr()) date = todayStr();
    return {
      amount: Number(amount.toFixed(2)),
      kind,
      category_id: cid,
      note: String((it.note || '')).slice(0, 20),
      date,
      payer: it.payer === 'other' ? (otherUid() || myUid()) : myUid(),
      shared: kind === 'expense' ? it.shared !== false : false,
    };
  }

  async function handleBillPicked(files) {
    if (!files || !files.length || state.chatBusy) return;
    state.chatBusy = true;
    state.chat.push({ role: 'user', text: files.length > 1 ? '📷 发了 ' + files.length + ' 张账单图片' : '📷 发了一张账单图片', imgs: [] });
    persistChat();
    render();

    try {
      const pairs = [];
      for (const f of files) {
        const [full, thumb] = await Promise.all([
          readImage(f, 1280, 0.85),
          readImage(f, 180, 0.7),
        ]);
        pairs.push([full, thumb]);
      }
      state.chat[state.chat.length - 1].imgs = pairs.map((p) => p[1]);
      persistChat();
      render();

      let parsed = null;
      if (DEMO) {
        const cat = state.categories.find((c) => c.name === '外卖') || state.categories.find((c) => c.name === '餐饮美食') || state.categories[0];
        await new Promise((r) => setTimeout(r, 600));
        parsed = {
          ok: true,
          reply: '识别出 2 笔（演示）',
          items: [
            { amount: 26, kind: 'expense', category_id: cat && cat.id, note: '演示·宫保鸡丁', date: todayStr(), payer: null, shared: true, confidence: 0.92 },
            { amount: 8, kind: 'expense', category_id: cat && cat.id, note: '演示·米饭', date: todayStr(), payer: null, shared: true, confidence: 0.88 },
          ],
        };
      } else {
        /* 逐张识别，所有笔合并成一张账单卡片 */
        const all = [];
        const replies = [];
        for (const [full] of pairs) {
          try {
            const r = await parseBillByLLM(full);
            if (r && r.ok !== false && Array.isArray(r.items) && r.items.length) {
              all.push(...r.items);
              if (r.reply) replies.push(r.reply);
            } else if (r && r.reply) {
              replies.push(r.reply);
            }
          } catch (e) {
            console.warn('[llm] 图片识别失败', e && (e.message || e));
          }
        }
        if (all.length) {
          parsed = { ok: true, items: all, reply: pairs.length > 1 ? ('几张图共识别出 ' + all.length + ' 笔') : (replies[0] || null) };
        } else if (replies.length) {
          parsed = { ok: false, reply: replies[0] };
        }
      }
      state.chatBusy = false;
      applyBill(parsed);
    } catch (e) {
      state.chatBusy = false;
      state.chat.push({ role: 'bot', text: '图片读取失败，换一张试试？', warn: true });
      persistChat();
      render();
    }
  }

  function applyBill(p) {
    if (!p || p.ok === false || !Array.isArray(p.items)) {
      state.chat.push({ role: 'bot', text: (p && p.reply) || '没认出账单内容，拍清晰一点再试？', warn: true });
      persistChat();
      render();
      return;
    }
    const items = p.items.slice(0, 20).map(normalizeBillItem).filter(Boolean);
    if (!items.length) {
      state.chat.push({ role: 'bot', text: '图片里没找到金额，确认这是账单截图吗？', warn: true });
      persistChat();
      render();
      return;
    }
    state.chat.push({ role: 'bot', text: p.reply || ('认出了 ' + items.length + ' 笔，核对一下：') });
    state.chat.push({ role: 'bill', items, status: 'pending' });
    persistChat();
    render();
  }

  function renderBillCard(m, i) {
    if (m.status === 'cancelled') return '';
    if (m.status === 'saved') {
      return `<div class="bill-card saved"><div class="bill-head">🧾 账单已入账 · ${m.savedCount || 0} 笔</div></div>`;
    }
    if (m.status === 'saving') {
      return `<div class="bill-card"><div class="bill-head">正在入账…</div></div>`;
    }
    const rows = m.items.map((it, j) => {
      const groups = state.categories.filter((c) => !c.parent_id && c.kind === it.kind);
      const opts = groups.map((g) => {
        const kids = state.categories.filter((c) => c.parent_id === g.id);
        const kidOpts = kids.map((k) => `<option value="${k.id}" ${k.id === it.category_id ? 'selected' : ''}>${esc((g.icon || '') + k.name)}</option>`).join('');
        return `<optgroup label="${esc(g.name)}">${kidOpts}<option value="${g.id}" ${g.id === it.category_id ? 'selected' : ''}>${esc(g.name)}（不细分）</option></optgroup>`;
      }).join('');
      return `<div class="bill-row">
        <input class="bill-amt" type="number" inputmode="decimal" step="0.01" value="${it.amount}" data-bill="${i}" data-row="${j}" data-field="amount">
        <select class="bill-cat" data-bill="${i}" data-row="${j}" data-field="category_id">${opts}</select>
        <input class="bill-note" type="text" value="${esc(it.note)}" placeholder="备注" maxlength="20" data-bill="${i}" data-row="${j}" data-field="note">
        <input class="bill-date" type="date" value="${esc(it.date)}" max="${todayStr()}" data-bill="${i}" data-row="${j}" data-field="date">
        <button class="bill-x" data-act="bill-del" data-i="${i}" data-row="${j}" aria-label="删除这一笔">✕</button>
      </div>`;
    }).join('');
    return `<div class="bill-card">
      <div class="bill-head">🧾 识别出 ${m.items.length} 笔，核对后入账（金额 / 分类 / 备注 / 日期都可改）</div>
      ${rows}
      <div class="rec-actions">
        <button data-act="bill-cancel" data-i="${i}">放弃</button>
        <button class="primary" data-act="bill-confirm" data-i="${i}">确认入账（${m.items.length} 笔）</button>
      </div>
    </div>`;
  }

  async function confirmBill(idx) {
    const m = state.chat[idx];
    if (!m || m.role !== 'bill' || m.status !== 'pending') return;
    const items = m.items.filter((it) => it.amount > 0);
    if (!items.length) { toast('没有可入账的条目'); return; }
    m.status = 'saving';
    render();

    const saved = [];
    for (const it of items) {
      const payload = {
        payer_id: it.kind === 'expense' ? it.payer : myUid(),
        payer_name: memberName(it.kind === 'expense' ? it.payer : myUid()),
        amount: Number(Number(it.amount).toFixed(2)),
        kind: it.kind,
        category_id: it.category_id,
        note: it.note || null,
        spent_on: it.date,
        is_shared: it.kind === 'expense' ? !!it.shared : false,
      };
      if (!payload.category_id) { toast('有条目还没选分类'); m.status = 'pending'; render(); return; }
      if (DEMO) {
        saved.push(Object.assign({ id: demoNextId--, created_at: new Date().toISOString() }, payload));
      } else {
        const { data, error } = await db().rpc('ledger_entry_add', { p_token: state.token, p_payload: payload });
        if (error || !data) {
          m.status = 'pending';
          persistChat();
          render();
          toast('保存失败：' + ((error && error.message) || '请检查网络'));
          return;
        }
        saved.push(data);
      }
    }
    saved.forEach((r) => state.entries.unshift(r));
    m.items = items;
    m.status = 'saved';
    m.savedCount = saved.length;
    persistChat();
    render();
    toast('入账 ' + saved.length + ' 笔');
  }

  /* ================= 对话式查询 =================
     用户可以直接问「这个月餐饮花了多少」「外卖哪几笔最贵」，
     模型只负责把话翻成条件（时间、分类、人、关键词），数字一律本地算，保证跟明细对得上。 */

  const QUERY_STRONG = ['多少', '几笔', '哪些', '哪几', '明细', '统计', '平均', '均价', '占比', '比例', '排行', '排名', '最高', '最多', '最少', '清单', '列表', '对比', '查一下', '查查', '帮我查', '看看', '一共', '总共', '合计', '总计'];
  const QUERY_WEAK = ['花了', '用了', '支出', '开销', '收入'];

  function looksLikeQuery(text) {
    const t = String(text || '').replace(/\s+/g, '');
    if (!t) return false;
    if (QUERY_STRONG.some((w) => t.includes(w))) return true;
    const hasAmount = /(\d+(?:\.\d+)?(?:块|元|毛|钱))|([零一二两三四五六七八九十百千]+(?:块|元))/.test(t);
    if (hasAmount) return false;
    return QUERY_WEAK.some((w) => t.includes(w));
  }

  function buildQuerySystem() {
    const paths = Array.from(new Set(state.categories.map((c) => {
      const p = c.parent_id ? catById(c.parent_id) : null;
      return p ? p.name + '/' + c.name : c.name;
    })));
    return [
      '你是中文记账助手的「查询理解器」。用户会用口语问自己账本里的问题，你只把它翻译成查询条件。',
      '只输出一个 JSON 对象，不要 markdown、不要解释。',
      '',
      '今天是 ' + todayStr() + '。当前用户是「' + (state.myName || '我') + '」，另一位成员是「' + memberName(otherUid()) + '」。',
      '账本里已有的分类（「一级/二级」）：',
      paths.join('、'),
      '',
      '输出结构：',
      '{"mode":"query","period":"thisMonth","from":null,"to":null,"kind":"expense","category":null,"person":"all","keyword":null,"focus":"total","reply":"看看本月餐饮"}',
      '',
      '字段规则：',
      '1. period 只能是 thisMonth（本月/这个月）、lastMonth（上个月）、last3Months（最近三个月）、thisYear（今年）、all（全部/总共/一共）、custom（用户说了具体日期区间时，同时填 from 与 to，格式 YYYY-MM-DD）。没提时间用 thisMonth。',
      '2. kind：expense（支出、花了、多少钱，默认）、income（收入、工资、进账）、both（收支、结余、一共进出一共花）。',
      '3. category：只能用上面出现过的分类名，二级写成「一级/二级」。用户说「吃的」「饭钱」这类口语要映射到最接近的分类；没提分类给 null。',
      '4. person：me（我、我的、我自己花的）、other（对方、TA、另一个人）、all（默认）。',
      '5. keyword：用户提到的具体东西或店铺（奶茶、星巴克、房租、打车），没有给 null。',
      '6. focus：total（只要一个总数）、breakdown（想知道钱分在哪几类）、list（想看具体哪几笔）。',
      '7. reply：一句口语复述，不超过 16 字，比如「看看 11 月外卖」。',
    ].join('\n');
  }

  async function askByLLM(text) {
    const model = await getModel();
    const history = state.chat
      .slice(0, Math.max(0, state.chat.length - 1))
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => ({ role: 'user', content: m.text }));

    let out = '';
    for await (const chunk of cloud.llm.chat.completions.create({
      model: model.id,
      messages: [{ role: 'system', content: buildQuerySystem() }, ...history, { role: 'user', content: text }],
      stream: true,
      temperature: 0,
    })) {
      const delta = chunk.choices[0] && chunk.choices[0].delta;
      if (delta && delta.content) out += delta.content;
    }
    const p = parseJsonLoose(out);
    if (p && !p.mode) p.mode = 'query';
    return p;
  }

  /* 把「餐饮美食/外卖」这种说法落到具体分类 id */
  function resolveCatSpec(spec) {
    const s = String(spec || '').replace(/\s+/g, '');
    if (!s) return { filterId: null, name: null };
    const parts = s.split(/[\/·>、,，]/).filter(Boolean);
    const leaf = parts[parts.length - 1];
    const rootName = parts.length > 1 ? parts[0] : null;
    const roots = state.categories.filter((c) => !c.parent_id);

    if (rootName) {
      const root = roots.find((c) => c.name === rootName) || roots.find((c) => c.name.includes(rootName) || rootName.includes(c.name));
      if (root) {
        const child = state.categories.find((c) => c.parent_id === root.id && (c.name === leaf || c.name.includes(leaf) || leaf.includes(c.name)));
        if (child) return { filterId: child.id, name: root.name + ' · ' + child.name };
        return { filterId: root.id, name: root.name };
      }
    }
    const rootHit = roots.find((c) => c.name === leaf) || roots.find((c) => c.name.includes(leaf) || leaf.includes(c.name));
    if (rootHit) return { filterId: rootHit.id, name: rootHit.name };
    const child = state.categories.find((c) => c.parent_id && (c.name === leaf || c.name.includes(leaf) || leaf.includes(c.name)));
    if (child) {
      const p = catById(child.parent_id);
      return { filterId: child.id, name: (p ? p.name + ' · ' : '') + child.name };
    }
    return { filterId: null, name: null, missing: leaf };
  }

  function periodRange(q) {
    const now = curYm();
    const monthRange = (ym) => ({ from: ym + '-01', to: ym + '-31', label: monthLabel(ym) });
    const ymd = (x) => x.slice(0, 4) + '年' + Number(x.slice(5, 7)) + '月' + Number(x.slice(8, 10)) + '日';
    const y = todayStr().slice(0, 4);
    switch (q && q.period) {
      case 'lastMonth': return monthRange(shiftYm(now, -1));
      case 'last3Months': return { from: shiftYm(now, -2) + '-01', to: now + '-31', label: '近 3 个月' };
      case 'thisYear': return { from: y + '-01-01', to: todayStr(), label: y + ' 年' };
      case 'all': return { from: '0000-01-01', to: '9999-12-31', label: '全部时间' };
      case 'custom': {
        const f = /^\d{4}-\d{2}-\d{2}$/.test((q && q.from) || '') ? q.from : now + '-01';
        const t = /^\d{4}-\d{2}-\d{2}$/.test((q && q.to) || '') ? q.to : todayStr();
        return { from: f, to: t, label: f === t ? ymd(f) : ymd(f) + ' 至 ' + ymd(t) };
      }
      default: return monthRange(now);
    }
  }

  function runQuery(q) {
    const range = periodRange(q);
    const kind = q.kind === 'income' ? 'income' : q.kind === 'both' ? 'both' : 'expense';
    const cat = resolveCatSpec(q.category);
    const who = q.person === 'me' ? myUid() : q.person === 'other' ? otherUid() : null;
    const kw = q.keyword ? String(q.keyword).trim() : null;

    const pick = (from, to) => state.entries.filter((e) => {
      if (cat.missing) return false; // 用户点名的分类不存在，宁可空也别乱算
      if (e.spent_on < from || e.spent_on > to) return false;
      if (kind !== 'both' && e.kind !== kind) return false;
      if (cat.filterId && !catMatch(e.category_id, cat.filterId)) return false;
      if (who && personOf(e) !== who) return false;
      if (kw && !kwMatch(e, kw)) return false;
      return true;
    });

    const list = pick(range.from, range.to);
    const total = list.reduce((s, e) => s + Number(e.amount), 0);
    const expSum = list.filter((e) => e.kind === 'expense').reduce((s, e) => s + Number(e.amount), 0);
    const incSum = list.filter((e) => e.kind === 'income').reduce((s, e) => s + Number(e.amount), 0);
    const count = list.length;
    const avg = count ? total / count : 0;
    const days = new Set(list.map((e) => e.spent_on)).size;
    const kindLabel = kind === 'income' ? '收入' : kind === 'both' ? '收支' : '支出';
    const scope = [range.label, cat.name, kw].filter(Boolean).join(' · ');

    let head;
    if (!count) {
      head = cat.missing
        ? '账本里没有「' + cat.missing + '」这个分类，要不要先建一个？'
        : scope + ' 没有记录。';
    } else if (kind === 'both') {
      head = scope + '：支出 ¥' + money(expSum) + ' · 收入 ¥' + money(incSum) + '，共 ' + count + ' 笔';
    } else {
      head = scope + '：' + kindLabel + ' ¥' + money(total) + '，' + count + ' 笔，平均每笔 ¥' + money(avg);
    }

    /* 和上个月同期同类比，只在按月问的时候给 */
    let compare = null;
    if (count && (q.period === 'thisMonth' || q.period === 'lastMonth' || !q.period)) {
      const baseYm = q.period === 'lastMonth' ? shiftYm(curYm(), -1) : curYm();
      const prevYm = shiftYm(baseYm, -1);
      const prevList = pick(prevYm + '-01', prevYm + '-31');
      const prevTotal = prevList.reduce((s, e) => s + Number(e.amount), 0);
      if (prevTotal > 0) {
        const diff = total - prevTotal;
        compare = '上月同期 ¥' + money(prevTotal) + '，' + (Math.abs(diff) < 0.01 ? '基本持平' : (diff > 0 ? '多了 ¥' : '少了 ¥') + money(Math.abs(diff)));
      }
    }

    const agg = aggregateByRoot(list);
    let topCats = [];
    if (cat.filterId && agg.length === 1) {
      /* 问到某个分类内部时，拆它下面的二级 */
      topCats = Array.from(agg[0].subs.values())
        .filter((s) => s.total > 0 && s.name !== '未细分')
        .sort((a, b) => b.total - a.total)
        .slice(0, 4)
        .map((s) => ({ name: s.name, total: s.total, pct: total ? (s.total / total) * 100 : 0 }));
      if (topCats.length <= 1) topCats = [];
    } else if (agg.length > 1) {
      topCats = agg.slice(0, 3).map((r) => ({
        name: r.name,
        total: r.total,
        pct: total ? (r.total / total) * 100 : 0,
      }));
    }
    const topEntries = list.slice()
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 3)
      .map((e) => ({
        date: e.spent_on.slice(5),
        label: catLabel(e.category_id).name + (e.note ? ' · ' + e.note : ''),
        amount: Number(e.amount),
        uid: personOf(e),
      }));

    return {
      head,
      kind,
      kindLabel,
      total,
      count,
      avg,
      days,
      compare,
      topCats: topCats,
      topEntries,
      jump: {
        /* 跳到有数据的那个月，而不是查询区间的终点 */
        month: list.length
          ? list.map((e) => ymOf(e.spent_on)).sort().reverse()[0]
          : curYm(),
        who: q.person === 'me' ? myUid() : q.person === 'other' ? otherUid() : 'all',
        catId: cat.filterId || null,
        kw: kw,
      },
    };
  }

  function applyQuery(q) {
    const res = runQuery(q);
    state.chat.push({ role: 'answer', res: res, jump: res.jump });
    persistChat();
    render();
  }

  /* --------- 本地兜底解析（模型不可用时） --------- */
  function cnToNum(s) {
    const map = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const unit = { 十: 10, 百: 100, 千: 1000 };
    let total = 0, num = 0, seen = false;
    for (const ch of s) {
      if (map[ch] !== undefined) { num = map[ch]; seen = true; }
      else if (unit[ch]) { total += (num || 1) * unit[ch]; num = 0; seen = true; }
      else return null;
    }
    return seen ? total + num : null;
  }

  const LOCAL_HINTS = [
    [['外卖', '美团', '饿了么', '点餐'], '外卖'],
    [['买菜', '菜市场', '生鲜', '菜店'], '买菜'],
    [['超市购物', '超市', '山姆', '盒马', '永辉', '沃尔玛', '大润发', '便利店', '开市客'], '超市购物'],
    [['奶茶', '咖啡', '星巴克', '瑞幸', '饮料', '可乐', '矿泉水', '买水', '瓶水', '零食'], '零食饮料'],
    [['早餐', '早饭', '午餐', '午饭', '晚餐', '晚饭', '吃饭', '吃面', '食堂', '聚餐', '火锅'], '堂食'],
    [['地铁', '公交', '公交卡'], '地铁公交'],
    [['打车', '滴滴', '出租车', '网约车'], '打车'],
    [['加油', '油费'], '加油'],
    [['停车'], '停车'],
    [['房租', '租金'], '房租'],
    [['水费', '电费', '燃气', '水电'], '水电燃气'],
    [['纸巾', '洗发水', '牙膏', '日用'], '日用百货'],
    [['衣服', '裤子', '鞋', '外套'], '服饰'],
    [['手机', '耳机', '电脑', '充电'], '数码'],
    [['电影', '票价'], '电影'],
    [['机票', '酒店', '旅行', '门票'], '旅行'],
    [['药', '感冒'], '药品'],
    [['医院', '挂号', '门诊'], '门诊'],
    [['红包'], '红包'],
    [['礼物', '送礼'], '礼物'],
    [['书'], '书籍'],
    [['课', '培训'], '课程'],
    [['话费', '充话费'], '话费'],
    [['会员', '订阅', 'vip'], '订阅会员'],
    [['工资', '薪水'], '工资'],
  ];

  function localParse(text) {
    const t = String(text).replace(/\s+/g, '');
    const amount = extractAmount(text);

    let kind = 'expense';
    if (/(工资|收入|到账|报销|进账|收到钱)/.test(t)) kind = 'income';

    let hit = null;
    for (const [words, catName] of LOCAL_HINTS) {
      if (words.some((w) => t.includes(w))) { hit = catName; break; }
    }
    let catId = null;
    if (hit) {
      const c = state.categories.find((x) => x.name === hit && (!x.parent_id || x.kind === kind));
      if (c) catId = c.id;
    }

    const payerOther = /(他付|她付|对方付|ta付)/i.test(t);
    const personal = /(我个人|自己的钱|自己花)/.test(t);

    return {
      ok: !!amount,
      amount: amount,
      kind: kind,
      category_id: catId,
      candidates: [],
      note: t.slice(0, 12),
      date: resolveDateExpr(t) || todayStr(),
      payer: payerOther ? 'other' : 'me',
      shared: !personal,
      confidence: catId ? 0.6 : 0,
      reply: amount ? (catId ? '记好了，确认一下分类' : '记下了，选个分类？') : '没听出金额，再说一次？比如「买水 5 块」',
      fallback: true,
    };
  }

  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* --------- 本地事实提取（优先于模型） ---------
     口语日期（昨天/前天/上周三/15号/11月14日）、金额、分类关键词，
     这些能从原话直接确定的东西不交给模型猜，杜绝「大盘鸡31记成燃气费100」 */
  function resolveDateExpr(t) {
    const now = new Date();
    const fmt = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const shift = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
    if (/今天|今日/.test(t)) return fmt(now);
    if (/昨晚|昨天|昨日/.test(t)) return fmt(shift(-1));
    if (/大前天/.test(t)) return fmt(shift(-3));
    if (/前天/.test(t)) return fmt(shift(-2));
    /* 周X / 星期X / 礼拜X，可带 上/本/这/下 前缀（周一为一周起点） */
    const wm = t.match(/(上|本|这|下)?(?:周|星期|礼拜)([一二三四五六日天])/);
    if (wm) {
      const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
      const target = map[wm[2]];
      const dow = now.getDay() === 0 ? 7 : now.getDay();
      const d = new Date(now);
      if (wm[1] === '上') d.setDate(d.getDate() - (dow - 1) - 7 + (target - 1));
      else if (wm[1] === '下') d.setDate(d.getDate() - (dow - 1) + 7 + (target - 1));
      else d.setDate(d.getDate() - (dow - 1) + (target - 1));
      return fmt(d);
    }
    if (/上周|上礼拜/.test(t)) return fmt(shift(-7));
    /* x月x号/x日，或裸 x号/x日（裸日期若大于今天按上个月理解） */
    const dm = t.match(/(?:(\d{1,2})月)?(\d{1,2})[号日]/);
    if (dm) {
      const day = Number(dm[2]);
      const month = dm[1] ? Number(dm[1]) - 1 : now.getMonth();
      let d = new Date(now.getFullYear(), month, day);
      if (!dm[1] && day > now.getDate()) d = new Date(now.getFullYear(), month - 1, day);
      return fmt(d);
    }
    return null;
  }

  function extractAmount(text) {
    const t = String(text);
    /* 1) 带货币单位的数字，取最后一个（「买了3瓶水15块」→15） */
    const withUnit = t.match(/(\d+(?:\.\d{1,2})?)\s*(?:块钱|块|元|毛|￥|¥)/g);
    if (withUnit) {
      const last = withUnit[withUnit.length - 1].match(/(\d+(?:\.\d{1,2})?)/);
      if (last) return Number(last[1]);
    }
    /* 2) 中文数字 + 块/元 */
    const cn = t.match(/([零一二两三四五六七八九十百千]+)\s*(?:块钱|块|元)/);
    if (cn) { const v = cnToNum(cn[1]); if (v) return v; }
    /* 3) 句尾裸数字（「大盘鸡外卖31」→31） */
    const tail = t.match(/(\d+(?:\.\d{1,2})?)\s*$/);
    if (tail) return Number(tail[1]);
    return null;
  }

  function hintCategory(text, kind) {
    if (kind === 'income') return null;
    const tt = String(text).replace(/\s+/g, '');
    for (const [words, catName] of LOCAL_HINTS) {
      if (words.some((w) => tt.includes(w))) {
        const c = state.categories.find((x) => x.name === catName && (!x.parent_id || x.kind === 'expense'));
        if (c) return c;
      }
    }
    return null;
  }

  function cleanNote(t) {
    let s = String(t);
    s = s.replace(/(\d+(?:\.\d{1,2})?)\s*(?:块钱|块|元|毛|￥|¥)/g, '');
    s = s.replace(/[零一二两三四五六七八九十百千]+\s*(?:块钱|块|元)/g, '');
    s = s.replace(/(?:今天|今日|今早|中午|早上|上午|晚上|凌晨|昨天|昨晚|昨日|前天|大前天|(?:上|本|这|下)?(?:周|星期|礼拜)[一二三四五六日天]|(?:上|本|这)周|上礼拜|这礼拜|\d{1,2}月\d{1,2}[号日]|\d{1,2}[号日])/g, '');
    s = s.replace(/(?:消费|花|买|支付)了|支付|付款|记一笔|记录|一共/g, '');
    s = s.replace(/[\s\d，,。.！!？?、~～]+$/g, '').replace(/^[\s，,。、]+/, '');
    return s.trim();
  }

  /* 把本地提取到的事实强加进解析结果；只要发生纠正，备注也从原话重取 */
  function enforceLocalFacts(p, rawText) {
    if (!p || typeof p !== 'object' || p.ok === false) return p;
    const amt = extractAmount(rawText);
    const dateHit = resolveDateExpr(rawText);
    const hint = hintCategory(rawText, p.kind === 'income' ? 'income' : 'expense');
    const fix = {};
    if (amt != null && Number(p.amount) !== amt) fix.amount = amt;
    if (dateHit) fix.date = dateHit;
    if (hint && Number(p.category_id) !== hint.id) fix.category_id = hint.id;
    if (Object.keys(fix).length) {
      fix.note = cleanNote(rawText) || String(rawText).slice(0, 12);
      return Object.assign({}, p, fix);
    }
    return p;
  }

  /* --------- 解析结果落地 --------- */
  function applyParse(p, rawText) {
    if (!p || p.ok === false || !p.amount) {
      state.chat.push({
        role: 'bot',
        text: (p && p.reply) || '没听出金额，再说一次？比如「买水 5 块」。',
        warn: true,
      });
      persistChat();
      render();
      return;
    }

    const draft = {
      amount: Number(p.amount),
      kind: p.kind === 'income' ? 'income' : 'expense',
      category_id: p.category_id ? Number(p.category_id) : null,
      note: (p.note || rawText).slice(0, 20),
      date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : todayStr(),
      payer: p.payer === 'other' ? (otherUid() || myUid()) : myUid(),
      shared: p.shared !== false,
    };
    if (draft.date > todayStr()) draft.date = todayStr();
    if (draft.kind === 'income') draft.shared = false;

    const card = {
      role: 'card',
      draft: draft,
      cands: draft.category_id ? [] : resolveCandidates(p.candidates, draft.kind),
      status: 'pending',
      question: p.reply || '归到哪一类？',
    };
    state.chat.push(card);
    const idx = state.chat.length - 1;

    const sure = draft.category_id && (typeof p.confidence !== 'number' || p.confidence >= 0.7);
    if (sure) {
      commitCard(idx);
      return;
    }
    persistChat();
    render();
  }

  async function commitCard(idx, categoryId) {
    const m = state.chat[idx];
    if (!m || m.role !== 'card' || m.status === 'saved') return;
    const d = Object.assign({}, m.draft);
    if (categoryId) d.category_id = Number(categoryId);
    if (!d.category_id) { toast('先选个分类'); return; }

    m.status = 'saving';
    render();

    const payload = {
      payer_id: d.kind === 'expense' ? d.payer : myUid(),
      payer_name: memberName(d.kind === 'expense' ? d.payer : myUid()),
      amount: Number(Number(d.amount).toFixed(2)),
      kind: d.kind,
      category_id: d.category_id,
      note: d.note || null,
      spent_on: d.date,
      is_shared: d.kind === 'expense' ? !!d.shared : false,
    };

    if (DEMO) {
      const rec = Object.assign({ id: demoNextId--, created_at: new Date().toISOString() }, payload);
      state.entries.unshift(rec);
      m.status = 'saved';
      m.entryId = rec.id;
      m.draft.category_id = d.category_id;
      m.cands = [];
      persistChat();
      render();
      toast('记好了（演示数据，不写云端）');
      return;
    }

    const { data, error } = await db().rpc('ledger_entry_add', { p_token: state.token, p_payload: payload });
    if (error || !data) {
      m.status = 'pending';
      persistChat();
      render();
      toast('保存失败：' + ((error && error.message) || '请检查网络'));
      return;
    }
    m.status = 'saved';
    m.entryId = data.id;
    m.draft.category_id = d.category_id;
    m.cands = [];
    state.entries.unshift(data);
    persistChat();
    render();
    toast('记好了');
  }

  async function undoCard(idx) {
    const m = state.chat[idx];
    if (!m || m.status !== 'saved' || !m.entryId) return;
    if (DEMO) {
      state.entries = state.entries.filter((e) => e.id !== m.entryId);
      m.status = 'undone';
      persistChat();
      render();
      toast('已撤销');
      return;
    }
    const { error } = await db().rpc('ledger_entry_delete', { p_token: state.token, p_id: m.entryId });
    if (error) { toast('撤销失败'); return; }
    state.entries = state.entries.filter((e) => e.id !== m.entryId);
    m.status = 'undone';
    persistChat();
    render();
    toast('已撤销');
  }

  function recatCard(idx) {
    const m = state.chat[idx];
    if (!m || m.role !== 'card') return;
    m.showAll = !m.showAll;
    render();
  }

  async function handleChatSend() {
    const text = String(state.chatInput || '').trim();
    if (!text || state.chatBusy) return;
    state.chatInput = '';
    state.chat.push({ role: 'user', text: text });
    state.chatBusy = true;
    persistChat();
    render();

    const asQuery = looksLikeQuery(text);
    let parsed = null;
    try {
      parsed = asQuery ? await askByLLM(text) : await parseByLLM(text);
    } catch (e) {
      console.warn('[llm] 解析失败', e && (e.message || e));
      parsed = null;
    }
    state.chatBusy = false;

    if (parsed && parsed.mode === 'query') { applyQuery(parsed); return; }

    if (asQuery) {
      /* 模型不可用或没给查询结果时，用本地关键词兜底，保证「问一句也有回答」 */
      applyQuery(localQueryParse(text));
      return;
    }

    if (!parsed) parsed = localParse(text);
    parsed = enforceLocalFacts(parsed, text);
    applyParse(parsed, text);
  }

  /* 不依赖模型的查询理解：抓时间词、分类名、谁付的 */
  const QUERY_SYN = [
    [/(吃饭|饭钱|餐饮|外卖|点餐|奶茶|咖啡|早餐|午餐|晚餐|夜宵|火锅)/, '餐饮美食'],
    [/(打车|滴滴|地铁|公交|通勤|加油|油费|停车|交通)/, '交通出行'],
    [/(房租|租房|水电|燃气|物业|日用|百货|家里)/, '居家生活'],
    [/(衣服|服饰|鞋|化妆品|护肤|数码|手机|购物|买东西)/, '购物'],
    [/(电影|游戏|旅行|旅游|健身|娱乐|玩)/, '娱乐休闲'],
    [/(红包|礼物|送礼|随礼|人情)/, '人情往来'],
    [/(书|课程|培训|会员|订阅|学习)/, '学习成长'],
    [/(话费|宽带|网费|流量)/, '通讯网络'],
    [/(看病|医院|药|体检|医疗)/, '医疗健康'],
  ];

  function localQueryParse(text) {
    const t = String(text || '').replace(/\s+/g, '');
    const q = { mode: 'query', period: 'thisMonth', kind: 'expense', category: null, person: 'all', keyword: null, focus: 'total', reply: '' };
    if (/上个月|上月/.test(t)) q.period = 'lastMonth';
    else if (/最近三个月|近三个月|这三个月/.test(t)) q.period = 'last3Months';
    else if (/今年|本年度/.test(t)) q.period = 'thisYear';
    else if (/全部|所有|历史|一共|总共/.test(t)) q.period = 'all';
    if (/工资|收入|进账|赚了/.test(t)) q.kind = 'income';
    else if (/结余|收支/.test(t)) q.kind = 'both';
    if (/对方|他付|他花|她付|她花|另一个人|TA/i.test(t)) q.person = 'other';
    else if (/(我|自己)(付|花|的)/.test(t)) q.person = 'me';

    /* 先认二级分类名，再认一级，最后按同义词归大类 */
    const roots = state.categories.filter((c) => !c.parent_id);
    let hit = null;
    state.categories.forEach((c) => {
      if (hit || !c.parent_id) return;
      if (t.includes(c.name)) hit = c.name;
    });
    if (hit) {
      const child = state.categories.find((c) => c.parent_id && c.name === hit);
      const root = child ? catById(child.parent_id) : null;
      q.category = root ? root.name + '/' + hit : hit;
    } else {
      const r = roots.find((x) => t.includes(x.name));
      if (r) q.category = r.name;
      else {
        const syn = QUERY_SYN.find(([re]) => re.test(t));
        if (syn) q.category = syn[1];
      }
    }

    /* 仍然没分类，就把去掉疑问词后剩下的内容当关键词 */
    if (!q.category) {
      const kw = t.replace(/(这个月|本月|上个月|上月|今年|最近三个月|近三个月|全部|所有|一共|总共|花了|花|多少钱|多少|几笔|哪几笔|哪些|明细|统计|平均|看看|帮我|查一下|查查|呢|吗|？|\?)/g, '');
      if (kw.length >= 2 && kw.length <= 8) q.keyword = kw;
    }
    return q;
  }

  /* --------- 语音输入 --------- */
  let recog = null;
  let recogFinal = '';
  let voiceTimer = null; // 启动超时保护
  let voiceStopTimer = null; // 停止兜底保护

  function clearVoiceTimers() {
    if (voiceTimer) { clearTimeout(voiceTimer); voiceTimer = null; }
    if (voiceStopTimer) { clearTimeout(voiceStopTimer); voiceStopTimer = null; }
  }

  function forceVoiceReset(msg) {
    clearVoiceTimers();
    try { if (recog) { recog.onresult = recog.onerror = recog.onend = recog.onstart = null; recog.stop(); } } catch (e) { /* 忽略 */ }
    recog = null;
    if (state.listening) {
      state.listening = false;
      render();
    }
    if (msg) toast(msg);
  }

  function startVoice() {
    if (state.listening) return; // 防止重复启动
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('这个环境不支持语音，用键盘上的麦克风键说话');
      return;
    }
    try {
      recog = new SR();
      recog.lang = 'zh-CN';
      recog.interimResults = true;
      recog.continuous = false;
      recogFinal = '';
      state.chatInput = '';

      let gotSignal = false; // 是否收到过识别器的任何回调

      recog.onstart = () => { gotSignal = true; clearVoiceTimers(); };
      recog.onresult = (ev) => {
        gotSignal = true; clearVoiceTimers();
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) recogFinal += r[0].transcript;
          else interim += r[0].transcript;
        }
        state.chatInput = (recogFinal + interim).trim();
        const inp = document.getElementById('chatInput');
        if (inp) inp.value = state.chatInput;
      };
      recog.onerror = (e) => {
        forceVoiceReset('没听清：' + (e.error || '识别失败'));
      };
      recog.onend = () => {
        clearVoiceTimers();
        state.listening = false;
        recog = null;
        render();
        if (state.chatInput.trim()) handleChatSend();
      };

      recog.start();
      state.listening = true;
      render();

      // 启动保护：4 秒内识别器没有任何回调（权限弹窗除外）视为环境不支持，强制复位
      voiceTimer = setTimeout(() => {
        if (!gotSignal && state.listening) {
          forceVoiceReset('这里语音用不了，请点输入框 → 键盘上的 🎤 听写键说话');
        }
      }, 4000);
    } catch (e) {
      forceVoiceReset('语音启动失败');
    }
  }

  function stopVoice() {
    if (voiceTimer) { clearTimeout(voiceTimer); voiceTimer = null; }
    try { if (recog) recog.stop(); } catch (e) { /* 已停止 */ }
    // 停止兜底：2 秒内 onend 没回来就强制复位（iOS 主屏模式下常见不回调）
    if (voiceStopTimer) clearTimeout(voiceStopTimer);
    voiceStopTimer = setTimeout(() => {
      if (state.listening) forceVoiceReset();
    }, 2000);
  }

  function toggleVoice() {
    if (state.listening) stopVoice();
    else startVoice();
  }

  /* ---------------- 弹层 ---------------- */
  function renderSheet() {
    if (!state.sheet) return '';
    const s = state.sheet;
    if (s.type === 'calendar') {
      const ym = s.ym || state.listMonth;
      const [y, m] = ym.split('-').map(Number);
      const firstDow = new Date(y, m - 1, 1).getDay();
      const daysInMonth = new Date(y, m, 0).getDate();
      const dayExp = {};
      const dayInc = {};
      state.entries.forEach((e) => {
        if (ymOf(e.spent_on) !== ym) return;
        if (state.listWho !== 'all' && personOf(e) !== state.listWho) return;
        const k = e.spent_on;
        if (e.kind === 'expense') dayExp[k] = (dayExp[k] || 0) + Number(e.amount);
        else dayInc[k] = (dayInc[k] || 0) + Number(e.amount);
      });
      const short = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));

      let cells = '';
      for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell pad"></div>';
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = ym + '-' + pad2(d);
        const exp = dayExp[ds] || 0;
        const inc = dayInc[ds] || 0;
        const has = exp || inc;
        cells += `<button class="cal-cell ${ds === todayStr() ? 'today' : ''} ${ds === state.listDay ? 'on' : ''} ${has ? 'has' : ''}" data-act="cal-pick" data-day="${ds}">
          <span class="cd">${d}</span>
          ${exp ? `<span class="ce">${short(exp)}</span>` : (inc ? `<span class="ci">+${short(inc)}</span>` : '')}
        </button>`;
      }

      return `<div class="sheet-mask" data-act="close-sheet">
        <div class="sheet" data-stop>
          <h4>选择日期</h4>
          <div class="cal-head">
            <button data-act="cal-prev" aria-label="上个月">‹</button>
            <span class="label">${esc(monthLabel(ym))}</span>
            <button data-act="cal-next" aria-label="下个月">›</button>
          </div>
          <div class="cal-week">${['日', '一', '二', '三', '四', '五', '六'].map((w) => `<span>${w}</span>`).join('')}</div>
          <div class="cal-grid">${cells}</div>
          <div class="cal-foot">红字为当天支出，绿字为当天收入</div>
          <div class="actions">
            <button class="btn ghost" data-act="cal-today">回到今天</button>
            <button class="btn ghost" data-act="close-sheet">关闭</button>
          </div>
        </div>
      </div>`;
    }
    if (s.type === 'entry') {
      const e = state.entries.find((x) => x.id === s.id);
      if (!e) return '';
      const lab = catLabel(e.category_id);
      const isExp = e.kind === 'expense';
      if (!s.edit) s.edit = { payer: e.payer_id || myUid(), shared: e.is_shared !== false };
      const ed = s.edit;
      const other = state.members.find((m) => m.user_id !== myUid());
      return `<div class="sheet-mask" data-act="close-sheet">
        <div class="sheet" data-stop>
          <h4>${esc(lab.icon)} ${esc(lab.name)}</h4>
          <div class="field"><span class="prefix">¥</span><input id="editAmt" type="number" inputmode="decimal" step="0.01" value="${Number(e.amount).toFixed(2)}"></div>
          <div class="field"><input id="editNote" type="text" placeholder="备注" value="${esc(e.note || '')}" maxlength="60"></div>
          <div class="field"><input id="editDate" type="date" value="${esc(e.spent_on)}" max="${todayStr()}"></div>
          ${isExp ? `<div class="meta" style="border:1px solid var(--line);border-radius:12px;overflow:hidden">
              <div class="line"><span class="k">谁付的</span>
                <div class="toggle">
                  <button class="${ed.payer === myUid() ? 'on' : ''}" data-act="edit-payer" data-uid="${esc(myUid())}">${faceWrap(myUid(), 16, state.myName || '我')}</button>
                  ${other ? `<button class="${ed.payer === other.user_id ? 'on' : ''}" data-act="edit-payer" data-uid="${esc(other.user_id)}">${faceWrap(other.user_id, 16, other.display_name || '对方')}</button>` : ''}
                </div>
              </div>
              <div class="line"><span class="k">归属</span>
                <div class="toggle" style="margin-left:auto">
                  <button class="${ed.shared ? 'on' : ''}" data-act="edit-shared" data-sh="1">共同</button>
                  <button class="${!ed.shared ? 'on' : ''}" data-act="edit-shared" data-sh="0">个人</button>
                </div>
              </div>
            </div>` : ''}
          <div class="actions">
            <button class="btn" data-act="save-entry" data-id="${e.id}">保存修改</button>
            <button class="btn danger" data-act="delete-entry" data-id="${e.id}">删除这笔</button>
          </div>
        </div>
      </div>`;
    }
    if (s.type === 'catpick') {
      const roots = state.categories.filter((c) => !c.parent_id && c.kind === 'expense');
      const rows = roots.map((r) => {
        const subs = state.categories.filter((c) => c.parent_id === r.id);
        return `<div class="cp-row">
          <button class="cp-root ${state.listCat === r.id ? 'on' : ''}" data-act="cat-pick" data-id="${r.id}">${esc(r.icon || '📦')} ${esc(r.name)}</button>
          ${subs.length ? `<div class="cp-subs">${subs.map((c) => `<button class="chip ${state.listCat === c.id ? 'on' : ''}" data-act="cat-pick" data-id="${c.id}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="sheet-mask" data-act="close-sheet">
        <div class="sheet" data-stop>
          <h4>按分类看明细</h4>
          <div style="margin-bottom:12px"><button class="chip ${state.listCat ? '' : 'on'}" data-act="cat-pick" data-id="">🧾 全部分类</button></div>
          ${rows}
        </div>
      </div>`;
    }
    if (s.type === 'prompt') {
      return `<div class="sheet-mask" data-act="close-sheet">
        <div class="sheet" data-stop>
          <h4>${esc(s.title)}</h4>
          <div class="field"><input id="promptInput" type="text" placeholder="${esc(s.placeholder || '')}" value="${esc(s.value || '')}" maxlength="20"></div>
          <div class="actions">
            <button class="btn" data-act="prompt-ok">确定</button>
            <button class="btn ghost" data-act="close-sheet">取消</button>
          </div>
        </div>
      </div>`;
    }
    return '';
  }

  /* ---------------- 渲染入口 ---------------- */
  function tabIcon(name) {
    const p = {
      chat: '<path d="M4.5 11.2c0-3.7 3.4-6.7 7.5-6.7s7.5 3 7.5 6.7-3.4 6.7-7.5 6.7c-.9 0-1.8-.1-2.6-.4L5 19l1-3.1c-1-1.3-1.5-2.9-1.5-4.7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
      entry: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      summary: '<path d="M5 19V10M12 19V5M19 19v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      me: '<circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="2"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    }[name];
    return `<svg width="21" height="21" viewBox="0 0 24 24" fill="none">${p}</svg>`;
  }

  function renderTabbar() {
    const tabs = [['chat', '说说'], ['entry', '记一笔'], ['list', '明细'], ['summary', '总结'], ['me', '我的']];
    return `<div class="tabbar">${tabs.map(([k, label]) => `<button class="${state.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${tabIcon(k).replace('currentColor', state.tab === k ? '#ff6b35' : '#9a9aa0')}<span>${label}</span></button>`).join('')}</div>`;
  }

  function render() {
    const app = $('#app');
    if (!state.ready) { app.innerHTML = '<div class="loading">加载中…</div>'; return; }

    if (!state.session) { app.innerHTML = renderGate(); return; }
    if (!state.book) { app.innerHTML = renderSetup(); return; }

    if (!state.draft) state.draft = newDraft();

    let inner = '';
    if (state.tab === 'chat') inner = renderChat();
    else if (state.tab === 'entry') inner = renderEntry();
    else if (state.tab === 'list') inner = renderList();
    else if (state.tab === 'summary') inner = renderSummary();
    else inner = renderMe();

    const showKeypad = state.tab === 'entry';
    const showComposer = state.tab === 'chat';

    app.innerHTML = `<div class="view" id="mainView">${inner}</div>
      ${showKeypad ? renderKeypad() : ''}
      ${showComposer ? renderComposer() : ''}
      ${renderTabbar()}
      ${renderSheet()}`;

    if (showComposer) {
      const v = $('#mainView');
      if (v) v.scrollTop = v.scrollHeight;
    }
  }

  /* 键盘输入只更新金额文本，避免整页重绘 */
  function updateAmountText() {
    const el = $('#amtVal');
    if (!el) return;
    el.textContent = state.draft.amount === '' ? '0.00' : state.draft.amount;
    el.classList.toggle('zero', state.draft.amount === '');
  }

  /* ---------------- 业务动作 ---------------- */
  async function boot() {
    if (DEMO) { startDemo(); return; }
    const saved = storedSession();
    if (saved && saved.token) {
      try {
        await loadState(saved.token);
        state.ready = true;
        state.draft = newDraft();
        render();
        return;
      } catch (e) {
        console.warn('[boot] 会话失效，重新登录', e && e.message);
        clearStoredSession();
      }
    }
    state.ready = true;
    render();
  }

  function applyState(d) {
    state.session = { user: { id: d.me.code } };
    state.books = d.books || [];
    state.book = state.books[0] || null;
    state.members = d.members || [];
    state.categories = d.categories || [];
    state.entries = d.entries || [];
    state.myName = d.me.display_name || '';
    state.chat = loadChatStore();
  }

  async function loadState(token) {
    const { data, error } = await db().rpc('ledger_state', { p_token: token });
    if (error) throw error;
    state.token = token;
    applyState(data);
  }

  async function loginWithCode() {
    const code = (state.login.code || '').trim();
    if (!/^\d{4}$/.test(code)) { state.login.error = '请输入 4 位数字编码'; render(); return; }
    state.login.busy = true; state.login.error = ''; render();
    const { data, error } = await db().rpc('ledger_login', { p_code: code });
    if (error) {
      state.login.busy = false;
      state.login.error = (error.message || '登录失败').replace(/^.*?: /, '');
      render();
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, code: data.code }));
    try {
      await loadState(data.token);
      state.draft = newDraft();
      state.tab = 'chat';
    } catch (e) {
      state.login.busy = false;
      state.login.error = '数据加载失败，请重试';
      render();
      return;
    }
    state.login.busy = false;
    render();
  }

  async function saveEntry() {
    const d = state.draft;
    const amt = parseFloat(d.amount);
    if (!amt || amt <= 0) { toast('先输入金额'); return; }
    const catId = d.cat2 || d.cat1;
    if (!catId) { toast('先选一个分类'); return; }

    const payload = {
      payer_id: d.kind === 'expense' ? d.payer : myUid(),
      payer_name: d.kind === 'expense' ? memberName(d.payer) : memberName(myUid()),
      amount: Number(amt.toFixed(2)),
      kind: d.kind,
      category_id: catId,
      note: d.note ? d.note.trim() : null,
      spent_on: d.date,
      is_shared: d.kind === 'expense' ? !!d.shared : false,
    };

    if (DEMO) {
      state.entries.unshift(Object.assign({ id: demoNextId--, created_at: new Date().toISOString() }, payload));
      state.draft = newDraft();
      state.tab = 'list';
      state.listMonth = ymOf(payload.spent_on); state.listDay = null;
      render();
      toast('记好了（演示数据，不写云端）');
      return;
    }

    const { data, error } = await db().rpc('ledger_entry_add', { p_token: state.token, p_payload: payload });
    if (error || !data) {
      toast('保存失败：' + ((error && error.message) || '未知错误'));
      return;
    }
    state.entries.unshift(data);
    state.draft = newDraft();
    state.tab = 'list';
    state.listMonth = ymOf(data.spent_on); state.listDay = null;
    render();
    toast('记好了');
  }

  async function updateEntry(id) {
    const amt = parseFloat($('#editAmt').value);
    if (!amt || amt <= 0) { toast('金额不对'); return; }
    const note = $('#editNote').value.trim();
    const date = $('#editDate').value || todayStr();
    const old = state.entries.find((x) => x.id === id);
    const payload = { amount: Number(amt.toFixed(2)), note: note || '', spent_on: date };
    if (old && old.kind === 'expense' && state.sheet && state.sheet.edit) {
      payload.is_shared = !!state.sheet.edit.shared;
      payload.payer_id = state.sheet.edit.payer;
      payload.payer_name = memberName(state.sheet.edit.payer);
    }
    if (DEMO) {
      const idx = state.entries.findIndex((e) => e.id === id);
      if (idx >= 0) state.entries[idx] = Object.assign({}, state.entries[idx], payload);
      state.sheet = null;
      render();
      toast('已更新');
      return;
    }
    const { data, error } = await db().rpc('ledger_entry_update', {
      p_token: state.token,
      p_id: id,
      p_payload: payload,
    });
    if (error) { toast('修改失败：' + (error.message || '')); return; }
    if (!data) { toast('没有权限修改这笔'); return; }
    const rec = data;
    const idx = state.entries.findIndex((e) => e.id === id);
    if (idx >= 0) state.entries[idx] = Object.assign({}, state.entries[idx], rec);
    state.sheet = null;
    render();
    toast('已更新');
  }

  async function deleteEntry(id) {
    if (DEMO) {
      state.entries = state.entries.filter((e) => e.id !== id);
      state.sheet = null;
      render();
      toast('已删除');
      return;
    }
    const { error } = await db().rpc('ledger_entry_delete', { p_token: state.token, p_id: id });
    if (error) { toast('删除失败：' + (error.message || '')); return; }
    state.entries = state.entries.filter((e) => e.id !== id);
    state.sheet = null;
    render();
    toast('已删除');
  }

  async function saveMyName(newName) {
    const uid = myUid();
    if (DEMO) {
      state.myName = newName;
      const mm = state.members.find((x) => x.user_id === uid);
      if (mm) mm.display_name = newName;
      state.sheet = null;
      render();
      toast('改好了（演示数据，不写云端）');
      return;
    }
    const { error } = await db().rpc('ledger_member_rename', { p_token: state.token, p_name: newName });
    if (error) { toast('改名失败：' + (error.message || '')); return; }
    state.myName = newName;
    const m = state.members.find((x) => x.user_id === uid);
    if (m) m.display_name = newName;
    state.sheet = null;
    render();
    toast('改好了');
  }

  async function addCategory(name) {
    const maxSort = state.categories.filter((c) => !c.parent_id && c.kind === 'expense')
      .reduce((s, c) => Math.max(s, c.sort_order || 0), 0) + 1;
    if (DEMO) {
      state.categories.push({ id: demoNextId--, book_id: 1, parent_id: null, name: name, kind: 'expense', icon: '🏷️', sort_order: maxSort });
      state.sheet = null;
      render();
      toast('分类已添加（演示数据，不写云端）');
      return;
    }
    const { data, error } = await db().rpc('ledger_category_add', {
      p_token: state.token,
      p_payload: { name: name, kind: 'expense', icon: '🏷️' },
    });
    if (error || !data) { toast('添加失败：' + ((error && error.message) || '')); return; }
    state.categories.push(data);
    state.sheet = null;
    render();
    toast('分类已添加');
  }

  async function logout() {
    if (DEMO) { location.reload(); return; }
    clearStoredSession();
    state.token = null;
    state.session = null;
    state.book = null;
    state.books = [];
    state.entries = [];
    state.categories = [];
    state.members = [];
    state.draft = null;
    state.tab = 'entry';
    state.login.code = '';
    render();
  }

  /* ---------------- 事件 ---------------- */
  const handlers = {
    tab: (el) => { state.tab = el.dataset.tab; if (state.tab === 'entry' && !state.draft) state.draft = newDraft(); render(); },

    mic: () => toggleVoice(),
    camera: () => { const f = $('#billFile'); if (f) f.click(); },
    'bill-confirm': (el) => confirmBill(Number(el.dataset.i)),
    'bill-cancel': (el) => {
      const m = state.chat[Number(el.dataset.i)];
      if (m && m.role === 'bill') { m.status = 'cancelled'; persistChat(); render(); }
    },
    'bill-del': (el) => {
      const m = state.chat[Number(el.dataset.i)];
      const r = Number(el.dataset.row);
      if (m && m.role === 'bill' && m.status === 'pending') {
        m.items.splice(r, 1);
        if (!m.items.length) m.status = 'cancelled';
        persistChat();
        render();
      }
    },
    'chat-send': () => handleChatSend(),
    'chat-clear': () => { state.chat = []; persistChat(); render(); },
    'pick-cand': (el) => commitCard(Number(el.dataset.i), Number(el.dataset.c)),
    'card-undo': (el) => undoCard(Number(el.dataset.i)),
    'card-recat': (el) => recatCard(Number(el.dataset.i)),
    'ans-list': (el) => {
      const m = state.chat[Number(el.dataset.i)];
      if (!m || !m.jump) return;
      state.listMonth = m.jump.month || curYm(); state.listDay = null;
      state.listWho = m.jump.who || 'all';
      state.listCat = m.jump.catId || null;
      state.listKw = m.jump.kw || null;
      state.tab = 'list';
      render();
    },
    'clear-cat': () => { state.listCat = null; render(); },
    'clear-kw': () => { state.listKw = null; render(); },
    'pick-cat': () => { state.sheet = { type: 'catpick' }; render(); },
    'cat-pick': (el) => {
      state.listCat = el.dataset.id ? Number(el.dataset.id) : null;
      state.sheet = null;
      render();
    },

    login: () => loginWithCode(),

    'set-kind': (el) => {
      const k = el.dataset.k;
      if (state.draft.kind === k) return;
      state.draft.kind = k;
      state.draft.cat1 = null;
      state.draft.cat2 = null;
      render();
    },
    'pick-c1': (el) => {
      const id = Number(el.dataset.id);
      if (state.draft.cat1 === id) return;
      state.draft.cat1 = id;
      state.draft.cat2 = null;
      render();
    },
    'pick-c2': (el) => {
      const id = Number(el.dataset.id);
      state.draft.cat2 = id === 0 ? null : id;
      render();
    },
    'set-payer': (el) => { state.draft.payer = el.dataset.uid; render(); },
    'toggle-shared': () => { state.draft.shared = !state.draft.shared; render(); },

    key: (el) => {
      const k = el.dataset.k;
      let a = state.draft.amount;
      if (k === 'del') a = a.slice(0, -1);
      else if (k === 'clear') a = '';
      else if (k === '.') { if (!a.includes('.')) a = (a || '0') + '.'; }
      else {
        if (a.includes('.') && a.split('.')[1].length >= 2) return;
        if (a.replace('.', '').length >= 9) return;
        a = a === '0' ? k : a + k;
      }
      state.draft.amount = a;
      updateAmountText();
    },

    save: () => saveEntry(),

    'list-prev': () => { state.listMonth = shiftYm(state.listMonth, -1); state.listDay = null; render(); },
    'list-next': () => { state.listMonth = shiftYm(state.listMonth, 1); state.listDay = null; render(); },
    'list-cal': () => { state.sheet = { type: 'calendar', ym: state.listMonth }; render(); },
    'cal-prev': () => { if (state.sheet) { state.sheet.ym = shiftYm(state.sheet.ym || state.listMonth, -1); render(); } },
    'cal-next': () => { if (state.sheet) { state.sheet.ym = shiftYm(state.sheet.ym || state.listMonth, 1); render(); } },
    'cal-pick': (el) => {
      const day = el.dataset.day;
      if (!day) return;
      state.sheet = null;
      state.listMonth = ymOf(day);
      state.listDay = day;
      render();
      toast(dayLabel(day) + '的明细');
    },
    'cal-today': () => {
      state.sheet = null;
      state.listMonth = curYm();
      state.listDay = todayStr();
      render();
      toast('回到今天');
    },
    'clear-day': () => { state.listDay = null; render(); },
    'list-who': (el) => { state.listWho = el.dataset.who || 'all'; render(); },
    'sum-prev': () => { state.month = shiftYm(state.month, -1); state.openCat = null; render(); },
    'sum-next': () => { state.month = shiftYm(state.month, 1); state.openCat = null; render(); },
    'toggle-cat': (el) => {
      const id = Number(el.dataset.id);
      state.openCat = state.openCat === id ? null : id;
      render();
    },

    'open-entry': (el) => { state.sheet = { type: 'entry', id: Number(el.dataset.id) }; render(); },
    'save-entry': (el) => updateEntry(Number(el.dataset.id)),
    'delete-entry': (el) => deleteEntry(Number(el.dataset.id)),
    'edit-payer': (el) => {
      if (state.sheet && state.sheet.edit) { state.sheet.edit.payer = el.dataset.uid; render(); }
    },
    'edit-shared': (el) => {
      if (state.sheet && state.sheet.edit) { state.sheet.edit.shared = el.dataset.sh === '1'; render(); }
    },
    'close-sheet': () => { state.sheet = null; render(); },
    'rename-me': () => { state.sheet = { type: 'prompt', title: '你的昵称', placeholder: '对方会看到这个名字', value: state.myName || '' }; render(); },
    'add-cat': () => { state.sheet = { type: 'prompt', title: '新增一级分类', placeholder: '例如：宠物' }; render(); },
    'prompt-ok': () => {
      const v = ($('#promptInput') && $('#promptInput').value || '').trim();
      if (!v) { toast('写个名字'); return; }
      if (state.sheet.title === '你的昵称') saveMyName(v);
      else addCategory(v);
    },
    logout: () => logout(),
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    const inSheet = ev.target.closest('[data-stop]');
    // 弹层内部：只在点到明确的操作按钮时响应（点空白不关闭弹层）
    if (inSheet && !(el && inSheet.contains(el) && el.dataset.act !== 'close-sheet')) return;
    if (!el) return;
    const fn = handlers[el.dataset.act];
    if (fn) { ev.preventDefault(); fn(el); }
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'noteInput') state.draft.note = ev.target.value;
    if (ev.target.id === 'dateInput') state.draft.date = ev.target.value || todayStr();
    if (ev.target.id === 'loginCode') state.login.code = ev.target.value;
    if (ev.target.id === 'chatInput') state.chatInput = ev.target.value;
    /* 账单卡片行内编辑：只改数据不重渲染，避免手机上输入焦点丢失 */
    if (ev.target.dataset && ev.target.dataset.bill !== undefined && ev.target.dataset.row !== undefined) {
      const m = state.chat[Number(ev.target.dataset.bill)];
      const row = m && m.items ? m.items[Number(ev.target.dataset.row)] : null;
      if (row) {
        const f = ev.target.dataset.field;
        if (f === 'amount') row.amount = Number(ev.target.value) || 0;
        else if (f === 'category_id') row.category_id = Number(ev.target.value) || null;
        else if (f === 'note') row.note = ev.target.value;
        else if (f === 'date') row.date = ev.target.value || todayStr();
      }
    }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'billFile' && ev.target.files && ev.target.files.length) {
      const files = Array.from(ev.target.files).slice(0, 5);
      ev.target.value = '';
      handleBillPicked(files);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      if (ev.target.id === 'loginCode') { ev.preventDefault(); loginWithCode(); }
      if (ev.target.id === 'chatInput') { ev.preventDefault(); handleChatSend(); }
    }
  });

  boot();

  if (DEMO) window.__ledger = { state: state, render: render, runQuery: runQuery };
})();
