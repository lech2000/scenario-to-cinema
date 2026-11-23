# Scenario-to-Cinema (`cinema-rpg/book-to-film-rpg`)

Система превращения текстового сценария (главы книги 1–20 стр.) в интерактивную соло-НРИ с живым 3D-превизом на **`raea` (JSX + Rust/Bevy)** и производством художественного мини-фильма (2–5 мин) через облачную видеогенерацию, спроектированная как **платный пак площадки ФиксАР (`agrigate.pro`)**.

## Структура репозитория

- `fixar-pack/` — декларативный пак ФиксАР (`apiVersion: aios.dev/v1alpha1`, валидирован против живого `https://api.agrigate.pro/registry/validate`):
  - `pack.yaml` — манифест пака, права (`traces:aggregate`, `network:egress`), секреты, коннектор `cinema-engine-api`;
  - `domains/book-to-film-rpg.yaml` — шаблон дела, 7-шаговый workflow, 3 тарифа в кредитах (`po_animatic`, `po_episode_stylized`, `po_episode_cinema`), сущности и 3 агента (`world-builder`, `game-master`, `showrunner`);
  - `tests/` и `evals/` — обязательные фикстуры и оценки безопасности;
  - `scripts/package-pack.sh` — сборка `.tar.gz` + SHA-256 для GitHub Release и `/pak/kabinet/`.
- `packages/shared/` — единые Zod/TypeScript-контракты (`WorldBible`, `GameEvent`, `ShotSpec`, `EpisodeCut`, `CostEstimate`, `RenderJob`).
- `packages/engine/` — World Builder (разбор главы книги 1–20 стр.), ИИ-Мастер с механикой `2d6`, **AI Showrunner** (`buildShowrunnerCut` — драматургическое сжатие длинной сессии в 3-актный сценарий 2–5 мин с титрами `EpisodeCredits`), генератор `ShotSpec` и клиент OpenAI-совместимых LLM (с офлайн-фолбэком для запуска без ключей).
- `packages/raea-dsl/` — детерминированный компилятор `ShotSpec + WorldBible → raea TSX` (14-сегментные шарнирные фигуры персонажей, нативный `<Character>`, пресеты `<Look mode="paint" | "cartoon">` и спайк `src/spike-tavern-duel.ts`).
- `packages/providers/` — Audio-First синтез речи по ролям (`MultiTierRoleAudioProvider`: OpenAI TTS / локальный macOS `say -v Milena` с тембровым разделением ролей / кроссплатформенный WAV-фолбэк), авто-тайминг кадров через `ffprobe`, генератор `.srt`/`.vtt` субтитров, SFX + ducking эмбиента, облачный Video-to-Video провайдер (`CloudV2VProvider`: `fal.ai` / `Runway` / `Kling` с авто-генерацией SVG референс-листов персонажей `ensureCharacterReferenceSheets` и контролем квот `reroll`), а также `BillingAdapter` и смета ФиксАР.
- `apps/connector/` — веб-студия (`GET /`) + асинхронный HTTP-коннектор: `Audio-First` озвучка до рендера → `raea` GPU рендер по длине аудио → интерактивный редактор шотов аниматика до оплаты (`POST /showrunner`, `PATCH/DELETE /shots/:shotId`, `PATCH /credits` с пересчётом TTS и сметы) → генерация финальных титров MP4 (`renderCreditsClipMp4`) → пошотовая очередь V2V `shotStates` и пересъёмка шотов (`reroll`).
- `CODER_SETUP.md` — пошаговая настройка дела `case_f6db507d967c49d9` и внешнего кодера площадки через MCP.

## Быстрый старт

```bash
npm install
npm run typecheck
npm run build
npm test
npm run spike:compile   # генерирует packages/raea-dsl/generated/tavern_duel_01.tsx
npm run pack:bundle     # собирает fixar-pack/dist/book-to-film-rpg-0.1.0.tar.gz + .sha256
```

Запуск веб-студии ИИ-мастера и локального 3D-рендера `raea` (`http://127.0.0.1:8787`):
```bash
# Офлайн-демо без API-ключей (с живым 3D-рендером raea + FFmpeg):
npm run connector:dev

# Или с любой OpenAI-совместимой LLM (OpenAI / OpenRouter / локальный LM Studio):
OPENAI_API_KEY=... LLM_MODEL=gpt-4o-mini npm run connector:dev

# С боевым облачным Video-to-Video провайдером (fal.ai / Runway / Kling):
FAL_KEY=... V2V_VENDOR=fal npm run connector:dev
# либо RUNWAYML_API_SECRET=... V2V_VENDOR=runway
# либо KLING_API_KEY=... V2V_VENDOR=kling
```
