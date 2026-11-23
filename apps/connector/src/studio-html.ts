export function renderStudioHtml(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Книга в кино · ИИ-НРИ + 3D raea Studio</title>
<style>
  :root {
    --bg: #0f1312;
    --panel: #161d1a;
    --panel-2: #1c2521;
    --line: #2d3b34;
    --text: #eef4f0;
    --muted: #98a99f;
    --accent: #a685e2;
    --accent-soft: rgba(166, 133, 226, 0.14);
    --green: #69d494;
    --amber: #f0b66e;
    --red: #ec7b7b;
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  header h1 { margin: 0; font-size: 17px; letter-spacing: -0.02em; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    background: var(--accent-soft);
    border: 1px solid rgba(166, 133, 226, 0.35);
    color: var(--accent);
  }
  main {
    display: grid;
    grid-template-columns: 320px 1fr 420px;
    gap: 14px;
    padding: 14px;
    height: calc(100vh - 57px);
  }
  @media (max-width: 1120px) {
    main { grid-template-columns: 1fr; height: auto; }
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 14px;
    overflow: auto;
  }
  h2 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  label { display: block; font-size: 12px; color: var(--muted); margin: 8px 0 4px; }
  textarea, input, select {
    width: 100%;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
    font: inherit;
  }
  textarea { resize: vertical; }
  button {
    cursor: pointer;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #120d1c;
    font-weight: 650;
    padding: 9px 13px;
    border-radius: 10px;
    font: inherit;
  }
  button.ghost {
    background: transparent;
    color: var(--text);
    border-color: var(--line);
  }
  button.small { padding: 5px 9px; font-size: 12px; }
  button:disabled { opacity: 0.5; cursor: default; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .card {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 10px 12px;
  }
  .chat-log {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-right: 4px;
  }
  .msg {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel-2);
  }
  .msg.player {
    align-self: flex-end;
    max-width: 86%;
    background: var(--accent-soft);
    border-color: rgba(166, 133, 226, 0.35);
  }
  .roll {
    display: inline-block;
    font-size: 11.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    margin-bottom: 6px;
  }
  .roll.success { background: rgba(105,212,148,0.16); color: var(--green); }
  .roll.partial { background: rgba(240,182,110,0.16); color: var(--amber); }
  .roll.fail { background: rgba(236,123,123,0.16); color: var(--red); }
  .choices { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .choices button { text-align: left; font-weight: 500; font-size: 12.5px; }
  .preview-box {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #090b0a;
    border: 1px solid var(--line);
    border-radius: 11px;
    overflow: hidden;
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 12.5px;
  }
  .preview-box img, .preview-box video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  pre {
    margin: 0;
    padding: 8px;
    border-radius: 8px;
    background: #0b0e0d;
    border: 1px solid var(--line);
    font-size: 11px;
    overflow: auto;
    max-height: 160px;
  }
  .muted { color: var(--muted); font-size: 12px; }
  .status { font-size: 12px; color: var(--amber); min-height: 18px; }
</style>
</head>
<body>
<header>
  <h1>Книга в кино · Прототип ИИ-НРИ + 3D raea</h1>
  <div class="row">
    <span class="badge" id="healthBadge">Проверка движка…</span>
    <span class="badge">ФиксАР Пак: cinema-rpg/book-to-film-rpg@0.1.0</span>
  </div>
</header>

<main>
  <!-- Left: Scenario & World Bible -->
  <section class="col">
    <h2>1. Сценарий и Библия мира</h2>
    <div class="row">
      <button type="button" class="ghost small" id="loadSampleBtn">Загрузить тестовую главу</button>
      <label style="margin:0; cursor:pointer" class="badge">
        Открыть .txt/.md
        <input id="fileInput" type="file" accept=".txt,.md,text/plain" style="display:none" />
      </label>
    </div>
    <label for="scenarioText">Текст главы книги (1–20 стр.)</label>
    <textarea id="scenarioText" rows="6" placeholder="Вставьте фрагмент книги или нажмите «Загрузить тестовую главу»…"></textarea>
    <div class="row">
      <div style="flex:1">
        <label for="stylePreset">Стиль фильма</label>
        <select id="stylePreset">
          <option value="arcane_3d">Анимация Arcane (3D)</option>
          <option value="photoreal_cinema">Кинореализм (35mm)</option>
          <option value="anime">Аниме</option>
          <option value="noir">Нуар</option>
        </select>
      </div>
      <div style="flex:1">
        <label for="heroName">Имя героя</label>
        <input id="heroName" placeholder="Напр. Мира" value="Мира" />
      </div>
    </div>
    <button type="button" id="startBtn">Создать мир (World Bible)</button>
    <div id="worldSummary" class="card muted">Мир ещё не создан.</div>
  </section>

  <!-- Center: AI Game Master Chat -->
  <section class="col">
    <h2>2. ИИ-Мастер и механика 2d6</h2>
    <div class="chat-log" id="chatLog">
      <div class="muted">Создайте мир слева, чтобы начать первую сцену.</div>
    </div>
    <div class="choices" id="choicesBox"></div>
    <div class="row">
      <select id="statSelect" style="width:150px" disabled>
        <option value="Смекалка">Смекалка</option>
      </select>
      <label class="row" style="margin:0; font-size:12px; color:var(--muted)">
        <input type="checkbox" id="renderMp4Check" checked style="width:auto" />
        Рендерить MP4 на ход
      </label>
    </div>
    <form id="turnForm" class="row">
      <input id="turnInput" placeholder="Опишите действие вашего героя…" disabled style="flex:1" />
      <button type="submit" id="sendBtn" disabled>Ход (2d6)</button>
    </form>
    <div class="status" id="turnStatus"></div>
  </section>

  <!-- Right: Live 3D Previz (raea) & Episode Animatic -->
  <section class="col">
    <h2>3. Живой 3D-превиз (raea) и Фильм</h2>
    <div class="preview-box" id="previzBox">Здесь появится 3D-кадр / клип raea</div>
    <div class="muted" id="previzMeta">Ожидает первого хода…</div>
    <details>
      <summary class="muted" style="cursor:pointer">Показать ShotSpec JSON</summary>
      <pre id="shotJson">{}</pre>
    </details>

    <hr style="border:0; border-top:1px solid var(--line); width:100%" />
    <h2>4. 3D-Аниматик и смета ФиксАР</h2>
    <div class="row">
      <select id="tariffSelect" style="flex:1">
        <option value="po_animatic">Аудио-аниматик (290 кр.)</option>
        <option value="po_episode_stylized" selected>Эпизод: Стилизация (V2V)</option>
        <option value="po_episode_cinema">Кинореализм Премиум (V2V)</option>
      </select>
      <button type="button" id="animaticBtn" disabled>Собрать 3D-аниматик</button>
    </div>
    <div class="preview-box" id="animaticBox">Аниматик ещё не собран</div>
    <div class="card muted" id="estimateCard">Смета появится после сборки аниматика.</div>
    <button type="button" id="approveBtn" disabled>Утвердить аниматик и запустить V2V (Mock)</button>
    <div class="status" id="filmStatus"></div>
  </section>
</main>

<script>
const SAMPLE_CHAPTER = \`Проклятие Серебряного Леса
На мокрой лесной дороге следопыт Мира находит следы пропавшего обоза, которые обрываются у серебряного дерева.
В окне старой таверны «Старый Ворон» дрожит тусклый свет свечей. У стола в углу сидит наёмник Шрам, положив руку на рукоять тесака, а у стойки притаился свидетель Торин, прячущий запечатанную записку.\`;

let sessionId = null;
let lastAnimaticData = null;

async function checkHealth() {
  try {
    const r = await fetch("/health");
    const d = await r.json();
    document.getElementById("healthBadge").textContent =
      (d.raeaAvailable ? "raea GPU: ON" : "raea: TSX-only") +
      " · TTS: " + (d.ttsProvider || "on") +
      " · LLM: " + (d.llmMode || "fallback");
  } catch {
    document.getElementById("healthBadge").textContent = "Коннектор недоступен";
  }
}
checkHealth();

document.getElementById("loadSampleBtn").onclick = () => {
  document.getElementById("scenarioText").value = SAMPLE_CHAPTER;
};

document.getElementById("fileInput").onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  document.getElementById("scenarioText").value = await file.text();
};

document.getElementById("startBtn").onclick = async () => {
  const scenarioText = document.getElementById("scenarioText").value.trim();
  if (!scenarioText) return alert("Вставьте текст сценария или загрузите тестовую главу.");
  const btn = document.getElementById("startBtn");
  btn.disabled = true;
  document.getElementById("turnStatus").textContent = "Строим Библию мира…";
  try {
    const res = await fetch("/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioText,
        stylePreset: document.getElementById("stylePreset").value,
        heroName: document.getElementById("heroName").value.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка создания мира");
    sessionId = data.session.sessionId;
    const wb = data.session.worldBible;
    const hero = wb.characters[0];

    document.getElementById("worldSummary").innerHTML =
      "<b>" + wb.title + "</b> (" + wb.stylePreset + ", " + data.source + ")<br/>" +
      "<small>Локация: " + wb.locations[0].name + " (" + wb.locations[0].lightingPreset + ")</small><br/>" +
      "<small>Персонажи: " + wb.characters.map(c => c.name).join(", ") + "</small><br/>" +
      "<small>Инвентарь героя: " + (hero.inventory || []).join(", ") + "</small>";

    const statSelect = document.getElementById("statSelect");
    statSelect.innerHTML = "";
    Object.entries(hero.stats || { Смекалка: 2 }).forEach(([k, v]) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k + " (+" + v + ")";
      statSelect.appendChild(opt);
    });
    statSelect.disabled = false;
    document.getElementById("turnInput").disabled = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("animaticBtn").disabled = false;

    const log = document.getElementById("chatLog");
    log.innerHTML = '<div class="msg"><b>Мастер:</b> ' + wb.sourceExcerptSummary + '<br/><small class="muted">Опишите первый ход героя.</small></div>';
    document.getElementById("turnStatus").textContent = "Мир готов. Сделайте первый ход!";
  } catch (err) {
    document.getElementById("turnStatus").textContent = "Ошибка: " + err.message;
  } finally {
    btn.disabled = false;
  }
};

async function submitTurn(text) {
  if (!sessionId || !text.trim()) return;
  document.getElementById("sendBtn").disabled = true;
  document.getElementById("turnStatus").textContent = "Бросок 2d6 + рендер 3D-сцены в raea…";
  const log = document.getElementById("chatLog");
  const pEl = document.createElement("div");
  pEl.className = "msg player";
  pEl.textContent = text;
  log.appendChild(pEl);
  log.scrollTop = log.scrollHeight;

  try {
    const res = await fetch("/v1/sessions/" + sessionId + "/turns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerInput: text,
        statToRoll: document.getElementById("statSelect").value,
        renderMp4: document.getElementById("renderMp4Check").checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка хода");

    const ev = data.event;
    const roll = ev.diceRoll;
    const mEl = document.createElement("div");
    mEl.className = "msg";
    mEl.innerHTML =
      '<span class="roll ' + roll.outcome + '">2d6 [' + roll.dice.join("+") + "] + " + roll.modifier + " = " + roll.total + " (" + roll.outcome + ")</span>" +
      "<div>" + ev.narrativeText + "</div>";
    log.appendChild(mEl);
    log.scrollTop = log.scrollHeight;

    const cBox = document.getElementById("choicesBox");
    cBox.innerHTML = "";
    (data.suggestedChoices || []).forEach((ch) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ghost";
      b.textContent = "→ " + ch;
      b.onclick = () => { document.getElementById("turnInput").value = ""; submitTurn(ch); };
      cBox.appendChild(b);
    });

    const pBox = document.getElementById("previzBox");
    if (data.media?.mp4Url) {
      const trackTag = data.media.vttUrl
        ? '<track kind="subtitles" srclang="ru" label="Русский" src="' + data.media.vttUrl + '" default />'
        : "";
      pBox.innerHTML = '<video controls autoplay playsinline src="' + data.media.mp4Url + '">' + trackTag + '</video>';
    } else if (data.media?.pngUrl) {
      pBox.innerHTML = '<img src="' + data.media.pngUrl + '" alt="3D Previz" />';
    } else {
      pBox.textContent = "TSX скомпилирован (локальный raea отключён)";
    }
    const audioSec = data.shot.audio?.audioDurationSec ? data.shot.audio.audioDurationSec + " сек TTS · " : "";
    const srtLink = data.media?.srtUrl ? ' · <a href="' + data.media.srtUrl + '" download style="color:var(--accent)">SRT</a>' : "";
    document.getElementById("previzMeta").innerHTML =
      "Шот " + data.shot.id + " · " + audioSec + data.shot.durationInFrames + " кадров · камера: " + data.shot.camera.mode + " · рендер: " + data.render.durationMs + " мс" + srtLink;
    document.getElementById("shotJson").textContent = JSON.stringify(data.shot, null, 2);
    document.getElementById("turnStatus").textContent = "Ход #" + ev.turnIndex + " записан в 3D-сцену.";
  } catch (err) {
    document.getElementById("turnStatus").textContent = "Ошибка: " + err.message;
  } finally {
    document.getElementById("sendBtn").disabled = false;
  }
}

document.getElementById("turnForm").onsubmit = (e) => {
  e.preventDefault();
  const input = document.getElementById("turnInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  submitTurn(text);
};

document.getElementById("animaticBtn").onclick = async () => {
  if (!sessionId) return;
  document.getElementById("animaticBtn").disabled = true;
  document.getElementById("filmStatus").textContent = "Собираем 3D-аниматик (raea + FFmpeg) и смету…";
  try {
    const res = await fetch("/v1/sessions/" + sessionId + "/animatic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tariffTier: document.getElementById("tariffSelect").value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка сборки аниматика");
    lastAnimaticData = data;
    const aBox = document.getElementById("animaticBox");
    if (data.animaticUrl) {
      const aTrack = data.vttUrl
        ? '<track kind="subtitles" srclang="ru" label="Русский" src="' + data.vttUrl + '" default />'
        : "";
      aBox.innerHTML = '<video controls autoplay playsinline src="' + data.animaticUrl + '">' + aTrack + '</video>';
    } else {
      aBox.textContent = data.concatNote || "Аниматик собран (без MP4).";
    }
    const est = data.estimate;
    const sizeMb = data.bytes ? (data.bytes / (1024 * 1024)).toFixed(2) + " МБ (лимит дела ФиксАР: 32 МБ)" : "—";
    const subLinks = data.srtUrl
      ? '<br/>Субтитры: <a href="' + data.srtUrl + '" download style="color:var(--accent)">Скачать .srt</a> · <a href="' + data.vttUrl + '" target="_blank" style="color:var(--accent)">WebVTT</a>'
      : "";
    document.getElementById("estimateCard").innerHTML =
      "<b>Смета ФиксАР:</b> " + est.priceCredits + " кредитов (~" + est.priceRubApprox + " ₽)<br/>" +
      "Шотов: " + est.shotCount + " · Длительность (Audio-First): " + est.totalDurationSec + " сек · Пересъёмок: " + est.includedRerolls + "<br/>" +
      "Размер аниматика: " + sizeMb + subLinks;
    document.getElementById("approveBtn").disabled = false;
    document.getElementById("filmStatus").textContent = "Аниматик готов! Проверьте и утвердите перед V2V.";
  } catch (err) {
    document.getElementById("filmStatus").textContent = "Ошибка: " + err.message;
  } finally {
    document.getElementById("animaticBtn").disabled = false;
  }
};

document.getElementById("approveBtn").onclick = async () => {
  if (!sessionId || !lastAnimaticData) return;
  document.getElementById("approveBtn").disabled = true;
  document.getElementById("filmStatus").textContent = "Запускаем утверждённый финальный рендер (Mock V2V)…";
  try {
    const res = await fetch("/v1/sessions/" + sessionId + "/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tariffTier: document.getElementById("tariffSelect").value,
        paymentGrantId: "grant_local_preview_001",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка утверждения");
    document.getElementById("filmStatus").textContent =
      "Готово! Job " + data.job.jobId + " · status=" + data.job.status + " · artifact=" + data.job.artifactUrl;
  } catch (err) {
    document.getElementById("filmStatus").textContent = "Ошибка: " + err.message;
  } finally {
    document.getElementById("approveBtn").disabled = false;
  }
};
</script>
</body>
</html>`;
}
