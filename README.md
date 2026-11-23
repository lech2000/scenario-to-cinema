# Scenario-to-Cinema (`cinema-rpg/book-to-film-rpg`)

Система превращения текстового сценария (главы книги 1–20 стр.) в интерактивную соло-НРИ с живым 3D-превизом на **`raea` (JSX + Rust/Bevy)** и производством художественного мини-фильма (2–5 мин) через облачную видеогенерацию, спроектированная как **платный пак площадки ФиксАР (`agrigate.pro`)**.

## Структура репозитория

- `fixar-pack/` — декларативный пак ФиксАР (`apiVersion: aios.dev/v1alpha1`, валидирован против живого `https://api.agrigate.pro/registry/validate`):
  - `pack.yaml` — манифест пака, права (`traces:aggregate`, `network:egress`), секреты, коннектор `cinema-engine-api`;
  - `domains/book-to-film-rpg.yaml` — шаблон дела, 7-шаговый workflow, 3 тарифа в кредитах (`po_animatic`, `po_episode_stylized`, `po_episode_cinema`), сущности и 3 агента (`world-builder`, `game-master`, `showrunner`);
  - `tests/` и `evals/` — обязательные фикстуры и оценки безопасности;
  - `scripts/package-pack.sh` — сборка `.tar.gz` + SHA-256 для GitHub Release и `/pak/kabinet/`.
- `packages/shared/` — единые Zod/TypeScript-контракты (`WorldBible`, `GameEvent`, `ShotSpec`, `EpisodeCut`, `CostEstimate`, `RenderJob`).
- `packages/engine/` — World Builder (разбор главы книги 1–20 стр.), ИИ-Мастер с механикой `2d6`, генератор `ShotSpec` и клиент OpenAI-совместимых LLM (с офлайн-фолбэком для запуска без ключей).
- `packages/raea-dsl/` — детерминированный компилятор `ShotSpec + WorldBible → raea TSX` и спайк Фазы 0 (`src/spike-tavern-duel.ts`).
- `packages/providers/` — абстракции `VideoProvider` (`MockVideoProvider` + заготовка `CloudV2VProviderSkeleton`), `AudioProvider`, `BillingAdapter` и калькулятор сметы в кредитах ФиксАР.
- `apps/connector/` — веб-студия (`GET /`) + асинхронный HTTP-коннектор (`raea` CLI рендер кадров/MP4 на GPU, склейка аниматика через FFmpeg, смета ФиксАР, проверка утверждения аниматика, `payment_grant_id` и идемпотентности).
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
```
