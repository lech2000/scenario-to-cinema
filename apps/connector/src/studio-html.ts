export function renderStudioHtml(): string {
  return `<!doctype html>
<html lang="ru" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Книга в кино · Диалог и План дела</title>
<style>
  :root {
    --bg: #f6f3ec;
    --surface: #fffdf9;
    --surface-2: #efebe1;
    --ink: #1b2420;
    --muted: #5f6c65;
    --line: #dcd6c8;
    --accent: #c2542d;
    --accent-soft: rgba(194, 84, 45, 0.11);
    --sage: #286c4b;
    --sage-soft: rgba(40, 108, 75, 0.12);
    --amber: #9c6514;
    --amber-soft: rgba(156, 101, 20, 0.13);
    --shadow: 0 8px 28px rgba(27, 36, 32, 0.06);
    --radius: 18px;
  }
  html[data-theme="dark"] {
    --bg: #121614;
    --surface: #191f1c;
    --surface-2: #222a26;
    --ink: #eef2ee;
    --muted: #9aa8a0;
    --line: #2d3832;
    --accent: #e27853;
    --accent-soft: rgba(226, 120, 83, 0.15);
    --sage: #58c28b;
    --sage-soft: rgba(88, 194, 139, 0.15);
    --amber: #eab25c;
    --amber-soft: rgba(234, 178, 92, 0.15);
    --shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 15px/1.58 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .serif {
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  }

  /* ── Top Bar ── */
  header {
    position: sticky;
    top: 0;
    z-index: 20;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line);
    padding: 12px 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .brand h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 11px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .pill.accent {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 32%, transparent);
    color: var(--accent);
  }
  .pill.sage {
    background: var(--sage-soft);
    border-color: color-mix(in srgb, var(--sage) 32%, transparent);
    color: var(--sage);
  }
  .top-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  button {
    cursor: pointer;
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    border-radius: 999px;
    padding: 8px 15px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    transition: transform 0.12s ease, border-color 0.15s ease, background 0.15s ease;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:active:not(:disabled) {
    transform: translateY(1px);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  button.sage {
    background: var(--sage);
    border-color: var(--sage);
    color: #fff;
  }
  button.small {
    padding: 5px 11px;
    font-size: 12px;
  }

  /* ── Visual Plan-Schema (4 Connected Steps) ── */
  .schema-wrap {
    max-width: 960px;
    width: 100%;
    margin: 16px auto 0;
    padding: 0 18px;
  }
  .schema-card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 16px 18px;
    box-shadow: var(--shadow);
  }
  .schema-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .schema-title {
    font-size: 12.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
  }
  .progress-track {
    width: 100%;
    height: 4px;
    background: var(--surface-2);
    border-radius: 99px;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--sage), var(--accent));
    transition: width 0.35s ease;
  }
  .schema-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    position: relative;
  }
  @media (max-width: 820px) {
    .schema-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 500px) {
    .schema-grid { grid-template-columns: 1fr; }
  }
  .step-node {
    text-align: left;
    border-radius: 14px;
    padding: 11px 13px;
    background: var(--bg);
    border: 1.5px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
    cursor: pointer;
  }
  .step-node.active {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .step-node.done {
    background: var(--sage-soft);
    border-color: color-mix(in srgb, var(--sage) 45%, var(--line));
  }
  .step-node.inspected {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .step-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 11.5px;
  }
  .step-status {
    font-weight: 700;
  }
  .step-node.done .step-status { color: var(--sage); }
  .step-node.active .step-status { color: var(--accent); }
  .step-node.pending .step-status { color: var(--muted); }
  .step-name {
    font-weight: 700;
    font-size: 14px;
    color: var(--ink);
  }
  .step-sub {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .inspector-drawer {
    margin-top: 12px;
    padding: 13px 15px;
    border-radius: 13px;
    background: var(--bg);
    border: 1px dashed var(--line);
    font-size: 13.5px;
    display: none;
  }
  .inspector-drawer.open { display: block; }
  .inspector-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
    margin: 8px 0 10px;
  }
  @media (max-width: 680px) {
    .inspector-grid { grid-template-columns: 1fr; }
  }

  /* ── Main Dialogue Stream ── */
  .dialogue-shell {
    flex: 1;
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
    padding: 18px 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .stream {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .turn {
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: fadeUp 0.2s ease-out;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .bubble {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 15px 18px;
    box-shadow: var(--shadow);
    max-width: 92%;
  }
  .turn.user {
    align-items: flex-end;
  }
  .turn.user .bubble {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    border-bottom-right-radius: 5px;
    max-width: 78%;
  }
  .turn.agent .bubble {
    border-bottom-left-radius: 5px;
  }
  .speaker-tag {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 5px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .prose p { margin: 0 0 8px; }
  .prose p:last-child { margin-bottom: 0; }

  /* ── Inline Visual Cards inside Stream ── */
  .media-card {
    margin-top: 12px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--line);
    background: var(--bg);
  }
  .video-stage {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #0d110f;
    display: grid;
    place-items: center;
    color: #9aa8a0;
    font-size: 13px;
  }
  .video-stage video, .video-stage img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .media-bar {
    padding: 9px 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12.5px;
    color: var(--muted);
  }
  .cast-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .cast-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 11px 5px 5px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--line);
    font-size: 12.5px;
    text-decoration: none;
    color: inherit;
  }
  .cast-chip img {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }
  .beats-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 13px;
    border-top: 1px solid var(--line);
  }
  .beat-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12.5px;
    padding: 6px 9px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
  }

  /* ── Sticky Voice + Text Composer ── */
  .composer-wrap {
    position: sticky;
    bottom: 0;
    z-index: 15;
    background: linear-gradient(180deg, transparent, var(--bg) 22%);
    padding: 10px 18px 18px;
  }
  .composer-inner {
    max-width: 860px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .chips-row {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
  }
  .chip {
    font-size: 12.5px;
    font-weight: 500;
    padding: 6px 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 999px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
  }
  .composer-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1.5px solid var(--line);
    border-radius: 999px;
    padding: 6px 8px 6px 10px;
    box-shadow: var(--shadow);
  }
  .composer-box:focus-within {
    border-color: var(--accent);
  }
  .mic-btn {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    padding: 0;
    display: grid;
    place-items: center;
    font-size: 18px;
    flex-shrink: 0;
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 35%, transparent);
    color: var(--accent);
  }
  .mic-btn.listening {
    background: var(--accent);
    color: #fff;
    animation: pulseRing 1.25s infinite;
  }
  @keyframes pulseRing {
    0% { box-shadow: 0 0 0 0 rgba(194, 84, 45, 0.45); }
    70% { box-shadow: 0 0 0 12px rgba(194, 84, 45, 0); }
    100% { box-shadow: 0 0 0 0 rgba(194, 84, 45, 0); }
  }
  #chatInput {
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 15px;
    padding: 6px 4px;
    min-width: 0;
  }
  .status-line {
    font-size: 12px;
    color: var(--muted);
    padding: 0 8px;
    min-height: 18px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  /* ── Book Chapter Sheet Modal ── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(15, 20, 18, 0.48);
    backdrop-filter: blur(4px);
    display: none;
    place-items: center;
    padding: 16px;
  }
  .modal-backdrop.open { display: grid; }
  .modal-sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 20px;
    max-width: 600px;
    width: 100%;
    padding: 20px 22px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .modal-sheet textarea, .modal-sheet input, .modal-sheet select {
    width: 100%;
    background: var(--bg);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px 12px;
    font: inherit;
  }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
</style>
</head>
<body>

<header>
  <div class="brand">
    <h1 class="serif">Книга в кино</h1>
    <span class="pill" id="engineBadge">Подключение…</span>
  </div>
  <div class="top-actions">
    <button type="button" class="small" id="explainAllBtn">🗺 Разъяснить все пункты дела</button>
    <button type="button" class="small" id="openBookModalBtn">📎 Глава книги</button>
    <button type="button" class="small" id="voiceOutToggle" aria-pressed="true">🔊 Озвучка: ВКЛ</button>
    <button type="button" class="small" id="themeToggle" title="Переключить светлую/тёмную тему">◐ Тема</button>
  </div>
</header>

<!-- Visual Plan-Schema of the Case -->
<section class="schema-wrap" aria-label="Визуальная схема плана дела">
  <div class="schema-card">
    <div class="schema-head">
      <span class="schema-title">Визуальный план-схема дела · 4 шага (нажмите любой пункт для разъяснения)</span>
      <span class="pill accent" id="stageCounterPill">Шаг 1 из 4</span>
    </div>
    <div class="progress-track"><div class="progress-fill" id="progressFill" style="width:12%"></div></div>
    <div class="schema-grid" id="schemaGrid"></div>
    <div class="inspector-drawer" id="inspectorDrawer"></div>
  </div>
</section>

<!-- Main Conversational + Voice Stream -->
<main class="dialogue-shell">
  <div class="stream" id="stream"></div>
</main>

<!-- Bottom Voice + Text Composer -->
<footer class="composer-wrap">
  <div class="composer-inner">
    <div class="chips-row" id="chipsRow"></div>
    <form class="composer-box" id="chatForm">
      <button type="button" class="mic-btn" id="micBtn" title="Голосовой ввод (русский язык)">🎙</button>
      <input
        id="chatInput"
        autocomplete="off"
        placeholder="Скажите голосом 🎙 или напишите действие героя / вопрос по делу…"
      />
      <button type="submit" class="primary" id="sendBtn">Отправить</button>
    </form>
    <div class="status-line">
      <span id="statusText">Готов к диалогу — нажмите на микрофон 🎙 или выберите подсказку выше.</span>
      <span id="audioIndicator"></span>
    </div>
  </div>
</footer>

<!-- Clean Slide-Up Sheet for Uploading/Pasting Full Book Chapter -->
<div class="modal-backdrop" id="bookModal">
  <div class="modal-sheet">
    <div class="row" style="justify-content:space-between">
      <strong class="serif" style="font-size:18px">Загрузить главу книги (1–20 стр.)</strong>
      <button type="button" class="small" id="closeBookModalBtn">✕ Закрыть</button>
    </div>
    <div class="row">
      <button type="button" class="small" id="fillSampleBtn">Подставить тестовую главу</button>
      <label class="pill" style="cursor:pointer">
        Выбрать .txt / .md файл
        <input id="fileInput" type="file" accept=".txt,.md,text/plain" style="display:none" />
      </label>
    </div>
    <textarea id="chapterTextarea" rows="7" placeholder="Вставьте текст главы книги или сценария…"></textarea>
    <div class="row">
      <div style="flex:1">
        <small style="color:var(--muted)">Атмосфера фильма</small>
        <select id="styleSelect">
          <option value="arcane_3d">Живописный 3D (Arcane)</option>
          <option value="noir">Детективный нуар</option>
          <option value="anime">Аниме</option>
          <option value="photoreal_cinema">Кинореализм (35 мм)</option>
        </select>
      </div>
      <div style="flex:1">
        <small style="color:var(--muted)">Имя вашего героя</small>
        <input id="heroInput" value="Мира" placeholder="Напр. Мира" />
      </div>
    </div>
    <div class="row" style="justify-content:flex-end">
      <button type="button" class="primary" id="submitChapterBtn">Создать мир и начать диалог</button>
    </div>
  </div>
</div>

<script>
const SAMPLE_CHAPTER = \`Проклятие Серебряного Леса
На мокрой лесной дороге следопыт Мира находит следы пропавшего обоза, которые обрываются у старого серебряного дерева.
В окне придорожной таверны «Старый Ворон» дрожит тусклый свет свечей. У углового стола сидит наёмник Шрам, положив ладонь на рукоять тесака, а у стойки притаился свидетель Торин, прячущий запечатанную записку.\`;

const API_BASE = window.location.pathname.replace(/\\/index\\.html$/, "").replace(/\\/+$/, "");
function apiUrl(p) { return API_BASE + p; }
function mediaUrl(u) { return u && u.startsWith("/") ? API_BASE + u : u; }

let sessionId = null;
let currentPlan = null;
let inspectedItemId = null;
let autoSpeak = true;
let activeAudio = null;
let busy = false;

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdownLite(md) {
  return String(md || "")
    .split(/\\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para)
        .replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>")
        .replace(/\\*(.+?)\\*/g, "<em>$1</em>")
        .replace(/\\n/g, "<br/>");
      return "<p>" + html + "</p>";
    })
    .join("");
}

function stopCurrentAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  document.getElementById("audioIndicator").textContent = "";
}

function speakAgentResponse(text, wavUrl) {
  if (!autoSpeak) return;
  stopCurrentAudio();
  if (wavUrl) {
    const audio = new Audio(mediaUrl(wavUrl));
    activeAudio = audio;
    document.getElementById("audioIndicator").textContent = "🔊 Звучит озвучка сцены…";
    audio.onended = () => { document.getElementById("audioIndicator").textContent = ""; };
    audio.onerror = () => { document.getElementById("audioIndicator").textContent = ""; };
    audio.play().catch(() => {});
    return;
  }
  if ("speechSynthesis" in window) {
    const plain = String(text || "").replace(/[*_#•✓●○]/g, "").trim();
    if (!plain) return;
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = "ru-RU";
    utter.rate = 1.03;
    document.getElementById("audioIndicator").textContent = "🔊 Ведущий разъясняет голосом…";
    utter.onend = () => { document.getElementById("audioIndicator").textContent = ""; };
    window.speechSynthesis.speak(utter);
  }
}

/* ── Render Interactive 4-Step Visual Plan-Schema ── */
function renderPlanSchema(plan, highlightId) {
  if (!plan) return;
  currentPlan = plan;
  if (highlightId) inspectedItemId = highlightId;

  document.getElementById("progressFill").style.width = (plan.progressPct || 12) + "%";
  const activeItem = plan.items.find((i) => i.status === "active") || plan.items[plan.items.length - 1];
  document.getElementById("stageCounterPill").textContent =
    "Шаг " + activeItem.stepNumber + " из " + plan.items.length + " · " + activeItem.costBadge;

  const grid = document.getElementById("schemaGrid");
  grid.innerHTML = plan.items.map((item) => {
    const stText = item.status === "done"
      ? "✓ Выполнено"
      : item.status === "active"
        ? "● Сейчас здесь"
        : "○ Впереди";
    const isInspected = inspectedItemId === item.id ? " inspected" : "";
    return '<button type="button" class="step-node ' + item.status + isInspected + '" data-step-id="' + item.id + '">' +
      '<div class="step-top">' +
        '<span class="step-status">' + stText + '</span>' +
        '<span style="color:var(--muted)">' + escapeHtml(item.costBadge) + '</span>' +
      '</div>' +
      '<div class="step-name">' + escapeHtml(item.title) + '</div>' +
      '<div class="step-sub">' + escapeHtml(item.subtitle) + '</div>' +
    '</button>';
  }).join("");

  grid.querySelectorAll("[data-step-id]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-step-id");
      inspectedItemId = inspectedItemId === id ? null : id;
      renderPlanSchema(currentPlan);
      renderInspector();
    };
  });

  renderInspector();
  renderQuickChips(plan.contextualActions || []);
}

function renderInspector() {
  const drawer = document.getElementById("inspectorDrawer");
  if (!currentPlan || !inspectedItemId) {
    drawer.className = "inspector-drawer";
    drawer.innerHTML = "";
    return;
  }
  const item = currentPlan.items.find((i) => i.id === inspectedItemId);
  if (!item) return;
  drawer.className = "inspector-drawer open";
  drawer.innerHTML =
    '<div class="row" style="justify-content:space-between">' +
      '<strong>' + escapeHtml(item.title) + ' — карточка пункта дела</strong>' +
      '<div class="row">' +
        '<button type="button" class="small primary" id="askAgentStepBtn">💬 Разъяснить в диалоге и голосом</button>' +
        '<button type="button" class="small" id="closeInspectorBtn">Скрыть</button>' +
      '</div>' +
    '</div>' +
    '<div class="inspector-grid">' +
      '<div><small style="color:var(--muted)">Что происходит:</small><br/>' + escapeHtml(item.explanation.what) + '</div>' +
      '<div><small style="color:var(--muted)">Зачем это нужно:</small><br/>' + escapeHtml(item.explanation.why) + '</div>' +
      '<div><small style="color:var(--muted)">Что сказать или написать:</small><br/>' + escapeHtml(item.explanation.howToAct) + '</div>' +
      '<div><small style="color:var(--muted)">Результат в деле:</small><br/>' + escapeHtml(item.explanation.deliverable) + '</div>' +
    '</div>';

  document.getElementById("closeInspectorBtn").onclick = () => {
    inspectedItemId = null;
    renderPlanSchema(currentPlan);
  };
  document.getElementById("askAgentStepBtn").onclick = () => {
    sendConverse("Разъясни подробно " + item.title, { targetPlanItemId: item.id });
  };
}

function renderQuickChips(actions) {
  const box = document.getElementById("chipsRow");
  box.innerHTML = "";
  (actions || []).slice(0, 5).forEach((act) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = act.label;
    b.onclick = () => sendConverse(act.prompt);
    box.appendChild(b);
  });
}

/* ── Append Conversational Messages & Inline Visual Cards ── */
function appendUserTurn(text) {
  const stream = document.getElementById("stream");
  const el = document.createElement("div");
  el.className = "turn user";
  el.innerHTML = '<div class="bubble"><div class="prose">' + renderMarkdownLite(text) + "</div></div>";
  stream.appendChild(el);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function appendAgentTurn(data) {
  const stream = document.getElementById("stream");
  const el = document.createElement("div");
  el.className = "turn agent";

  let extraHtml = "";

  // 1. World Created -> Character Badges
  if (data.kind === "world_created" && data.worldBible) {
    const chips = (data.worldBible.characters || []).map((c) => {
      const ref = mediaUrl(c.refSheetUrls?.[0]);
      return '<a class="cast-chip" href="' + (ref || "#") + '" target="_blank">' +
        (ref ? '<img src="' + ref + '" alt="' + escapeHtml(c.name) + '" />' : "") +
        '<span><strong>' + escapeHtml(c.name) + '</strong> · <span style="color:var(--muted)">' + escapeHtml(c.role) + "</span></span>" +
      "</a>";
    }).join("");
    extraHtml += '<div class="cast-row">' + chips + "</div>";
  }

  // 2. Story Turn -> Live 3D Frame / Clip
  if (data.kind === "story_turn" && data.media) {
    let stageInner = '<span style="padding:16px">3D-сцена записана в монтажный лист</span>';
    if (data.media.mp4Url) {
      const tr = data.media.vttUrl
        ? '<track kind="subtitles" srclang="ru" label="Русский" src="' + mediaUrl(data.media.vttUrl) + '" default />'
        : "";
      stageInner = '<video controls autoplay playsinline src="' + mediaUrl(data.media.mp4Url) + '">' + tr + "</video>";
    } else if (data.media.pngUrl) {
      stageInner = '<img src="' + mediaUrl(data.media.pngUrl) + '" alt="3D кадр сцены" />';
    }
    extraHtml +=
      '<div class="media-card">' +
        '<div class="video-stage">' + stageInner + '</div>' +
        '<div class="media-bar">' +
          '<span>Кадр ' + escapeHtml(data.shot?.id) + ' · ракурс: ' + escapeHtml(data.shot?.camera?.mode) + '</span>' +
          (data.media.srtUrl ? '<a href="' + mediaUrl(data.media.srtUrl) + '" download style="color:var(--accent)">Субтитры .srt</a>' : "") +
        '</div>' +
      '</div>';
  }

  // 3. Draft Ready / Draft Edited -> 3-Act Animatic + One-Tap Edit Chips + Approve Button
  if ((data.kind === "draft_ready" || data.kind === "draft_edited") && data.episodeCut) {
    let draftVideo = '<span style="padding:16px">3-актный черновик со звуком и субтитрами собран</span>';
    if (data.animaticUrl) {
      const tr = data.vttUrl
        ? '<track kind="subtitles" srclang="ru" label="Русский" src="' + mediaUrl(data.vttUrl) + '" default />'
        : "";
      draftVideo = '<video controls autoplay playsinline src="' + mediaUrl(data.animaticUrl) + '?t=' + Date.now() + '">' + tr + "</video>";
    }
    const beatsMap = {};
    (data.episodeCut.beats || []).forEach((b) => { beatsMap[b.shotId] = b; });
    const beatRows = (data.episodeCut.shots || []).map((s, idx) => {
      const b = beatsMap[s.id];
      return '<div class="beat-item">' +
        '<span><strong>Кадр #' + (idx + 1) + '</strong>' + (b ? ' · Акт ' + b.act : '') + ' · ракурс: <em>' + escapeHtml(s.camera?.mode) + '</em></span>' +
        '<span class="row">' +
          '<button type="button" class="small" data-quick-prompt="В ' + (idx + 1) + ' кадре сделай крупный план">Крупный план</button>' +
          (data.episodeCut.shots.length > 1
            ? '<button type="button" class="small" data-quick-prompt="Удали ' + (idx + 1) + ' кадр">✕ Убрать</button>'
            : '') +
        '</span>' +
      '</div>';
    }).join("");

    extraHtml +=
      '<div class="media-card">' +
        '<div class="video-stage">' + draftVideo + '</div>' +
        '<div class="media-bar">' +
          '<span><strong>Смета ФиксАР: ' + data.estimate.priceCredits + ' кр. (~' + data.estimate.priceRubApprox + ' ₽)</strong> · ' + data.estimate.totalDurationSec + ' сек</span>' +
          '<button type="button" class="sage small" data-quick-prompt="Утверждаю, выпускай финальный фильм">✅ Утвердить и выпустить фильм</button>' +
        '</div>' +
        '<div class="beats-list">' + beatRows + '</div>' +
      '</div>';
  }

  // 4. Final Film Ready / Shot Rerolled
  if ((data.kind === "film_ready" || data.kind === "shot_rerolled") && data.job) {
    const job = data.job;
    const mp4 = job.masteredMp4Url ? mediaUrl(job.masteredMp4Url) + "?t=" + Date.now() : "";
    const vtt = job.masteredVttUrl ? mediaUrl(job.masteredVttUrl) : "";
    const srt = job.masteredSrtUrl ? mediaUrl(job.masteredSrtUrl) : "";
    const rerollBtns = (job.shotStates || []).map((st, idx) =>
      '<button type="button" class="small" data-quick-prompt="Пересними ' + (idx + 1) + ' кадр">↻ Дубль кадра #' + (idx + 1) + '</button>'
    ).join("");

    extraHtml +=
      '<div class="media-card">' +
        (mp4
          ? '<div class="video-stage"><video controls autoplay playsinline src="' + mp4 + '">' +
              (vtt ? '<track kind="subtitles" srclang="ru" label="Русский" src="' + vtt + '" default />' : "") +
            '</video></div>'
          : '') +
        '<div class="media-bar">' +
          '<span><strong>Готовый фильм с титрами</strong> · ' + (((job.masteredBytes || 0) / (1024 * 1024)).toFixed(2)) + ' МБ</span>' +
          '<span class="row">' +
            (mp4 ? '<a href="' + mp4 + '" download style="color:var(--sage);font-weight:600">Скачать MP4</a>' : '') +
            (srt ? '<a href="' + srt + '" download style="color:var(--accent)">SRT</a>' : '') +
          '</span>' +
        '</div>' +
        '<div class="media-bar" style="border-top:1px solid var(--line)">' + rerollBtns + '</div>' +
      '</div>';
  }

  el.innerHTML =
    '<div class="bubble">' +
      '<div class="speaker-tag"><span>Ведущий дела</span></div>' +
      '<div class="prose">' + renderMarkdownLite(data.replyText) + '</div>' +
      extraHtml +
    '</div>';

  el.querySelectorAll("[data-quick-prompt]").forEach((btn) => {
    btn.onclick = () => sendConverse(btn.getAttribute("data-quick-prompt"));
  });

  stream.appendChild(el);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

  // Update suggested choices if story turn returned them
  if (data.suggestedChoices && data.suggestedChoices.length > 0) {
    const turnChips = data.suggestedChoices.map((c) => ({ label: "→ " + c, prompt: c }));
    turnChips.push({ label: "🎬 Собрать черновик фильма", prompt: "Собери черновик фильма" });
    turnChips.push({ label: "🗺 Разъясни пункты дела", prompt: "Разъясни все пункты дела" });
    renderQuickChips(turnChips);
  }
}

/* ── Unified Conversational Request ── */
async function sendConverse(message, extra) {
  const clean = String(message || "").trim();
  if (!clean || busy) return;
  busy = true;
  document.getElementById("sendBtn").disabled = true;
  appendUserTurn(clean.length > 260 ? clean.slice(0, 260) + "… (глава книги)" : clean);
  document.getElementById("statusText").textContent = "Ведущий обрабатывает ваш шаг…";

  try {
    const res = await fetch(apiUrl("/v1/converse"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId || undefined,
        message: clean,
        targetPlanItemId: extra?.targetPlanItemId,
        stylePreset: extra?.stylePreset,
        heroName: extra?.heroName,
        speakReply: autoSpeak,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка обработки сообщения");

    if (data.sessionId) sessionId = data.sessionId;
    if (data.plan) renderPlanSchema(data.plan, data.highlightedItemId);
    if (data.followUpActions) renderQuickChips(data.followUpActions);

    appendAgentTurn(data);
    // Avoid auto-speaking if an inline video with its own audio track is already autoplaying
    const hasInlineAutoplayVideo =
      (data.kind === "story_turn" && data.media?.mp4Url) ||
      ((data.kind === "draft_ready" || data.kind === "draft_edited") && data.animaticUrl) ||
      ((data.kind === "film_ready" || data.kind === "shot_rerolled") && data.job?.masteredMp4Url);

    if (!hasInlineAutoplayVideo) {
      speakAgentResponse(data.replyText, data.voiceUrl);
    }
    document.getElementById("statusText").textContent = "Готов к вашей следующей реплике голосом 🎙 или текстом.";
  } catch (err) {
    document.getElementById("statusText").textContent = "Ошибка: " + err.message;
  } finally {
    busy = false;
    document.getElementById("sendBtn").disabled = false;
  }
}

/* ── Initial Bootstrap ── */
async function initApp() {
  try {
    const [hRes, pRes] = await Promise.all([
      fetch(apiUrl("/health")),
      fetch(apiUrl("/v1/plan-preview")),
    ]);
    const h = await hRes.json();
    document.getElementById("engineBadge").textContent =
      (h.raeaAvailable ? "3D GPU: активен" : "3D: быстрый режим") + " · 4 шага";
    const p = await pRes.json();
    if (p.plan) renderPlanSchema(p.plan);
    if (p.welcome) {
      appendAgentTurn({
        kind: "explanation",
        replyText:
          "Здравствуйте! Я ваш **ведущий дела и режиссёр**.\n\n" + p.welcome.replyText,
      });
    }
  } catch {
    document.getElementById("engineBadge").textContent = "Офлайн";
  }
}
initApp();

/* ── Form, Theme, Voice Output & Chapter Modal Controls ── */
document.getElementById("chatForm").onsubmit = (e) => {
  e.preventDefault();
  const inp = document.getElementById("chatInput");
  const val = inp.value.trim();
  if (!val) return;
  inp.value = "";
  sendConverse(val);
};

document.getElementById("explainAllBtn").onclick = () => {
  sendConverse("Разъясни все пункты дела");
};

document.getElementById("themeToggle").onclick = () => {
  const html = document.documentElement;
  html.setAttribute("data-theme", html.getAttribute("data-theme") === "dark" ? "light" : "dark");
};

document.getElementById("voiceOutToggle").onclick = (e) => {
  autoSpeak = !autoSpeak;
  if (!autoSpeak) stopCurrentAudio();
  e.currentTarget.textContent = autoSpeak ? "🔊 Озвучка: ВКЛ" : "🔇 Озвучка: ВЫКЛ";
};

const bookModal = document.getElementById("bookModal");
document.getElementById("openBookModalBtn").onclick = () => bookModal.classList.add("open");
document.getElementById("closeBookModalBtn").onclick = () => bookModal.classList.remove("open");
document.getElementById("fillSampleBtn").onclick = () => {
  document.getElementById("chapterTextarea").value = SAMPLE_CHAPTER;
};
document.getElementById("fileInput").onchange = async (e) => {
  const f = e.target.files?.[0];
  if (f) document.getElementById("chapterTextarea").value = await f.text();
};
document.getElementById("submitChapterBtn").onclick = () => {
  const text = document.getElementById("chapterTextarea").value.trim() || SAMPLE_CHAPTER;
  const stylePreset = document.getElementById("styleSelect").value;
  const heroName = document.getElementById("heroInput").value.trim() || undefined;
  bookModal.classList.remove("open");
  sendConverse(text, { stylePreset, heroName });
};

/* ── Web Speech API Russian Voice Input (🎙) ── */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRec) {
  recognition = new SpeechRec();
  recognition.lang = "ru-RU";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    isListening = true;
    stopCurrentAudio();
    document.getElementById("micBtn").classList.add("listening");
    document.getElementById("statusText").textContent = "🎙 Слушаю по-русски… говорите в микрофон";
  };

  recognition.onresult = (event) => {
    let transcript = "";
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) isFinal = true;
    }
    document.getElementById("chatInput").value = transcript;
    if (isFinal && transcript.trim()) {
      document.getElementById("chatInput").value = "";
      sendConverse(transcript.trim());
    }
  };

  recognition.onerror = () => {
    isListening = false;
    document.getElementById("micBtn").classList.remove("listening");
    document.getElementById("statusText").textContent = "Не удалось распознать голос — попробуйте ещё раз или напишите текстом.";
  };

  recognition.onend = () => {
    isListening = false;
    document.getElementById("micBtn").classList.remove("listening");
  };
}

document.getElementById("micBtn").onclick = () => {
  if (!recognition) {
    alert("Ваш браузер не поддерживает голосовой ввод Web Speech API (откройте в Chrome, Safari или Edge).");
    return;
  }
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
};
</script>
</body>
</html>`;
}
