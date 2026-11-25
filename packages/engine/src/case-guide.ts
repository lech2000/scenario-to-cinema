import { z } from "zod";
import {
  type CameraMode,
  type CasePlanItem,
  type CasePlanSnapshot,
  type CostEstimate,
  type QuickActionChip,
  type RenderJob,
  type SimplifiedStageId,
  type StylePresetId,
  CasePlanSnapshotSchema,
} from "@cinema-rpg/shared";
import type { RuntimeSessionState } from "./game-master.js";
import type { StructuredLLMClient } from "./llm.js";

export const DEFAULT_SAMPLE_CHAPTER_RU = `Проклятие Серебряного Леса
На мокрой лесной дороге следопыт Мира находит следы пропавшего обоза, которые обрываются у старого серебряного дерева.
В окне придорожной таверны «Старый Ворон» дрожит тусклый свет свечей. У углового стола сидит наёмник Шрам, положив ладонь на рукоять тесака, а у стойки притаился свидетель Торин, прячущий запечатанную записку.`;

const LLMExplanationSchema = z.object({
  replyText: z.string().min(1),
});

export function buildCasePlanSnapshot(params: {
  caseId?: string;
  session?: RuntimeSessionState;
  finalJob?: RenderJob;
  lastEstimate?: CostEstimate;
}): CasePlanSnapshot {
  const caseId = params.session?.caseId ?? params.caseId ?? "case_f6db507d967c49d9";
  const session = params.session;
  const finalJob = params.finalJob;
  const est = params.lastEstimate;

  const hasWorld = Boolean(session?.worldBible);
  const turnCount = session?.events.length ?? 0;
  const hasDraft = Boolean(session?.episodeCut && session.episodeCut.shots.length > 0);
  const hasAnimatic = Boolean(session?.animaticUrl || hasDraft);
  const isFilmDone = finalJob?.status === "done";

  let currentStage: SimplifiedStageId = "book_intake";
  if (isFilmDone) {
    currentStage = "final_film";
  } else if (hasAnimatic) {
    currentStage = "draft_cut";
  } else if (hasWorld) {
    currentStage = "story_play";
  }

  const progressPct = isFilmDone
    ? 100
    : currentStage === "draft_cut"
      ? 75
      : currentStage === "story_play"
        ? turnCount > 0
          ? 50
          : 28
        : 10;

  const wb = session?.worldBible;
  const step1Subtitle = wb
    ? `«${wb.title}» · герои: ${wb.characters.map((c) => c.name).join(", ")}`
    : "Вставьте главу книги или скажите «Начни по примеру»";

  const step2Subtitle =
    turnCount > 0
      ? `Сыграно сцен: ${turnCount} · озвучка и 3D на лету`
      : "Говорите или пишите за героя — кубики 2d6 решат исход";

  const draftShots = session?.episodeCut?.shots.length ?? turnCount;
  const step3Subtitle =
    hasDraft && est
      ? `${draftShots} кадр. (${est.totalDurationSec} сек) · смета ${est.priceCredits} кр. (~${est.priceRubApprox} ₽)`
      : hasDraft
        ? `Собран 3-актный черновик (${draftShots} кадр.)`
        : "Авто-сжатие в 3 акта, озвучка и прозрачная смета";

  const step4Subtitle = isFilmDone
    ? `Готов MP4 с титрами (${(((finalJob?.masteredBytes ?? 0) / (1024 * 1024)) || 0.1).toFixed(1)} МБ)`
    : "Запускается только после вашего слова «Утверждаю»";

  const items: CasePlanItem[] = [
    {
      id: "step_1_book",
      stepNumber: 1,
      stageId: "book_intake",
      title: "1. Глава и герои",
      subtitle: step1Subtitle,
      status: hasWorld ? "done" : "active",
      costBadge: "Бесплатно",
      explanation: {
        what: "Агент читает вашу главу книги (или стартовый отрывок), выделяет место действия, атмосферу освещения, главного героя и соперников.",
        why: "Чтобы в каждом последующем кадре персонажи, их голоса и декорации оставались цельными без ручной настройки.",
        howToAct:
          "Скажите голосом или напишите: «Начни по тестовой главе в стиле нуар» либо прикрепите свой текст кнопкой «📎 Глава книги».",
        deliverable: "Готовая карточка мира, характеристики героя для бросков 2d6 и визуальные силуэты персонажей.",
      },
      quickActions: hasWorld
        ? [{ label: "Показать героев мира", prompt: "Объясни пункт 1" }]
        : [
            { label: "▶ Начать по тестовой главе", prompt: "Начни по тестовой главе" },
            { label: "Нуар-детектив по примеру", prompt: "Начни по тестовой главе в стиле нуар" },
          ],
    },
    {
      id: "step_2_play",
      stepNumber: 2,
      stageId: "story_play",
      title: "2. Живая сцена (2d6)",
      subtitle: step2Subtitle,
      status: !hasWorld ? "pending" : hasAnimatic || isFilmDone ? "done" : "active",
      costBadge: "Бесплатно",
      explanation: {
        what: "Вы общаетесь с ведущим голосом или текстом от лица героя. На каждом важном шаге бросаются два кубика 2d6 (10+ успех, 7–9 успех с ценой, <=6 поворот), звучат голоса персонажей и строится 3D-кадр сцены.",
        why: "Сюжет не заскриптован: ваши решения меняют ход сцен, а 3D-превиз сразу показывает композицию будущего фильма.",
        howToAct:
          "Просто говорите, что делает или спрашивает ваш герой — например: «Подхожу к Шраму и требую правду про обоз».",
        deliverable: "Озвученные игровые сцены с субтитрами и 3D-раскадровкой каждого хода.",
      },
      quickActions: !hasWorld
        ? [{ label: "Сначала создать мир", prompt: "Начни по тестовой главе" }]
        : [
            {
              label: "Спросить Шрама про обоз",
              prompt: "Подхожу к столу и требую у Шрама правду о пропавшем обозе",
            },
            {
              label: "Осмотреть таверну",
              prompt: "Осматриваю зал в поисках тайной улики",
            },
            ...(turnCount > 0
              ? [{ label: "🎬 Собрать черновик фильма", prompt: "Собери черновик фильма" }]
              : []),
          ],
    },
    {
      id: "step_3_draft",
      stepNumber: 3,
      stageId: "draft_cut",
      title: "3. Черновик и смета",
      subtitle: step3Subtitle,
      status: isFilmDone ? "done" : hasAnimatic ? "active" : "pending",
      costBadge: "Бесплатно до согласия",
      explanation: {
        what: "Режиссёр автоматически сжимает сыгранные ходы в 3-актный сценарий (Завязка → Конфликт → Развязка), склеивает озвученный 3D-аниматик с титрами и считает точную смету.",
        why: "Вы видите и слышите весь будущий ролик заранее и можете голосом поправить любой ракурс, реплику или удалить лишний кадр ДО списания кредитов.",
        howToAct:
          "Скажите: «Собери черновик фильма», а затем при желании: «В 1 кадре сделай крупный план», «Удали 2 кадр» или «Назови фильм Тени Ворона».",
        deliverable: "Цельный 3D-аниматик с русской озвучкой, субтитрами, титрами и прозрачной сметой в кредитах ФиксАР.",
      },
      quickActions: hasAnimatic
        ? [
            { label: "Крупный план в 1 кадре", prompt: "В 1 кадре сделай крупный план" },
            { label: "✅ Утверждаю, выпускай фильм", prompt: "Утверждаю, выпускай финальный фильм" },
          ]
        : turnCount > 0
          ? [{ label: "🎬 Собрать черновик фильма", prompt: "Собери черновик фильма" }]
          : [],
    },
    {
      id: "step_4_film",
      stepNumber: 4,
      stageId: "final_film",
      title: "4. Готовый фильм",
      subtitle: step4Subtitle,
      status: isFilmDone ? "done" : "pending",
      costBadge: "По смете после согласия",
      explanation: {
        what: "По каждому утверждённому кадру запускается финальная видеогенерация с сохранением внешности персонажей и склейка единого MP4 (до 32 МБ) со звуком, субтитрами и титрами.",
        why: "Дорогая генерация включается только один раз — по проверенному вами черновику, с включённым запасом бесплатных пересъёмок отдельных кадров.",
        howToAct:
          "После просмотра черновика скажите: «Утверждаю, выпускай финальный фильм». Если захотите переснять отдельный кадр: «Пересними 1 кадр».",
        deliverable: "Финальный художественный MP4-фильм с многоголосой озвучкой, мягкими субтитрами и титрами.",
      },
      quickActions: isFilmDone
        ? [{ label: "↻ Переснять 1 кадр", prompt: "Пересними 1 кадр" }]
        : hasAnimatic
          ? [{ label: "✅ Утверждаю выпуск фильма", prompt: "Утверждаю, выпускай финальный фильм" }]
          : [],
    },
  ];

  const activeItem = items.find((i) => i.status === "active") ?? items[items.length - 1];
  const contextualActions: QuickActionChip[] = [
    ...activeItem.quickActions,
    { label: "🗺 Разъясни все пункты дела", prompt: "Разъясни все пункты дела" },
  ];

  return CasePlanSnapshotSchema.parse({
    caseId,
    currentStage,
    progressPct,
    items,
    contextualActions,
  });
}

export async function explainCasePlan(params: {
  plan: CasePlanSnapshot;
  targetItemId?: string;
  userQuestion?: string;
  llm?: StructuredLLMClient;
}): Promise<{
  replyText: string;
  highlightedItemId?: string;
  followUpActions: QuickActionChip[];
}> {
  const { plan, userQuestion } = params;
  const resolvedId = params.targetItemId ?? detectTargetItemIdFromText(userQuestion ?? "");
  const targetItem = resolvedId ? plan.items.find((i) => i.id === resolvedId) : undefined;

  if (targetItem) {
    const statusLabel =
      targetItem.status === "done"
        ? "уже выполнен ✓"
        : targetItem.status === "active"
          ? "сейчас активен ●"
          : "ждёт своей очереди ○";

    let replyText = [
      `**${targetItem.title}** (${statusLabel} · *${targetItem.costBadge}*)`,
      `• **Что здесь происходит:** ${targetItem.explanation.what}`,
      `• **Зачем это нужно:** ${targetItem.explanation.why}`,
      `• **Как действовать в диалоге:** ${targetItem.explanation.howToAct}`,
      `• **Итог шага:** ${targetItem.explanation.deliverable}`,
    ].join("\n");

    if (params.llm && params.llm.mode === "openai_compatible" && userQuestion) {
      try {
        const out = await params.llm.generateJson({
          systemPrompt:
            "Ты дружелюбный ведущий дела ФиксАР. Кратко, тепло и без техжаргона разъясни человеку выбранный пункт плана дела на русском языке (4–6 предложений). Ответь JSON { replyText }.",
          userPrompt: `Вопрос пользователя: "${userQuestion}"\nДанные пункта:\n${replyText}`,
          schema: LLMExplanationSchema,
        });
        if (out?.replyText) replyText = out.replyText;
      } catch {
        // Keep deterministic explanation
      }
    }

    return {
      replyText,
      highlightedItemId: targetItem.id,
      followUpActions:
        targetItem.quickActions.length > 0
          ? targetItem.quickActions
          : plan.contextualActions,
    };
  }

  const active = plan.items.find((i) => i.status === "active") ?? plan.items[0];
  const lines = [
    "Вот как устроено наше дело — всего **4 понятных шага** от текста книги до готового фильма:",
    "",
    ...plan.items.map((item) => {
      const icon = item.status === "done" ? "✓" : item.status === "active" ? "●" : "○";
      return `${icon} **${item.title}** (*${item.costBadge}*) — ${item.explanation.what}`;
    }),
    "",
    `Сейчас мы на шаге **«${active.title}»**. ${active.explanation.howToAct}`,
  ];

  return {
    replyText: lines.join("\n"),
    highlightedItemId: active.id,
    followUpActions: plan.contextualActions,
  };
}

export function detectTargetItemIdFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/пункт\s*1|шаг\s*1|перв[а-яё]*\s+(пункт|шаг)|про\s+книг|про\s+геро/.test(lower)) {
    return "step_1_book";
  }
  if (/пункт\s*2|шаг\s*2|втор[а-яё]*\s+(пункт|шаг)|про\s+2d6|про\s+кубик|жив[а-яё]*\s+сцен/.test(lower)) {
    return "step_2_play";
  }
  if (/пункт\s*3|шаг\s*3|трет[а-яё]*\s+(пункт|шаг)|черновик|смет|аниматик/.test(lower)) {
    return "step_3_draft";
  }
  if (/пункт\s*4|шаг\s*4|четв[её]рт[а-яё]*\s+(пункт|шаг)|финальн[а-яё]*\s+фильм|про\s+оплат/.test(lower)) {
    return "step_4_film";
  }
  return undefined;
}

export type ConversationalIntent =
  | { kind: "explain_plan"; targetItemId?: string }
  | {
      kind: "start_book";
      scenarioText: string;
      stylePreset: StylePresetId;
      heroName?: string;
    }
  | { kind: "build_draft" }
  | {
      kind: "edit_draft";
      shotIndex?: number;
      cameraMode?: CameraMode;
      deleteShot?: boolean;
      dialogueText?: string;
      customTitle?: string;
    }
  | { kind: "approve_film" }
  | { kind: "reroll_shot"; shotIndex: number }
  | { kind: "play_turn"; playerInput: string };

function detectStyleFromText(text: string, fallback: StylePresetId = "arcane_3d"): StylePresetId {
  const lower = text.toLowerCase();
  if (/нуар|noir|ч[её]рно-бел/.test(lower)) return "noir";
  if (/аниме|anime/.test(lower)) return "anime";
  if (/кинореализм|фотореал|35\s*мм|photoreal/.test(lower)) return "photoreal_cinema";
  if (/аркейн|arcane|живопис/.test(lower)) return "arcane_3d";
  return fallback;
}

function detectCameraModeFromText(text: string): CameraMode | undefined {
  const lower = text.toLowerCase();
  if (/крупн[а-яё]*\s+план|close[\s_-]?up/.test(lower)) return "close_up";
  if (/общ[а-яё]*\s+план|establishing/.test(lower)) return "establishing";
  if (/через\s+плеч|ots|over[\s_-]?the[\s_-]?shoulder/.test(lower)) return "over_the_shoulder";
  if (/двойн[а-яё]*|средн[а-яё]*\s+план|two[\s_-]?shot/.test(lower)) return "medium_two_shot";
  if (/нижн[а-яё]*\s+ракурс|героич[а-яё]*|low[\s_-]?angle/.test(lower)) return "low_angle_hero";
  if (/проезд|трекинг|dolly/.test(lower)) return "dolly_track";
  return undefined;
}

function parseShotOrdinalOneBased(text: string): number | undefined {
  const lower = text.toLowerCase();
  const numMatch = lower.match(/(?:кадр[а-яё]*|шот[а-яё]*|сцен[а-яё]*)\s*#?\s*(\d+)|(\d+)\s*-?[а-яё]*\s*(?:кадр|шот)/);
  if (numMatch) {
    const n = Number(numMatch[1] ?? numMatch[2]);
    if (n >= 1) return n;
  }
  if (/перв[а-яё]*\s+(?:кадр|шот|сцен)/.test(lower)) return 1;
  if (/втор[а-яё]*\s+(?:кадр|шот|сцен)/.test(lower)) return 2;
  if (/трет[а-яё]*\s+(?:кадр|шот|сцен)/.test(lower)) return 3;
  if (/четв[её]рт[а-яё]*\s+(?:кадр|шот|сцен)/.test(lower)) return 4;
  return undefined;
}

/**
 * Classifies a natural-language user message (spoken via microphone or typed)
 * into a simplified 4-step pipeline action.
 */
export function parseConversationalAction(params: {
  message: string;
  hasSession: boolean;
  hasShots: boolean;
  hasDraft: boolean;
  hasFinalJob: boolean;
  preferredStyle?: StylePresetId;
  preferredHeroName?: string;
}): ConversationalIntent {
  const raw = params.message.trim();
  const lower = raw.toLowerCase();

  // 1. Explicit request to explain the case plan or any specific item
  if (
    /разъясн|объясн[а-яё]*\s+(?:все\s+)?(?:пункт|шаг|план|дело|схем|этап)|расскаж[а-яё]*\s+план|что\s+означа[а-яё]*\s+пункт|какие\s+пункт|где\s+мы\s+сейчас|помощ|как\s+это\s+работает/.test(
      lower
    )
  ) {
    return {
      kind: "explain_plan",
      targetItemId: detectTargetItemIdFromText(raw),
    };
  }

  // 2. Demo / book start intent (or first message before session exists)
  const asksDemo =
    /тестов[а-яё]*\s+глав|по\s+примеру|загруз[а-яё]*\s+пример|демо[\s-]?глав|начн[а-яё]*\s+с\s+примера/.test(
      lower
    );
  if (asksDemo) {
    return {
      kind: "start_book",
      scenarioText: DEFAULT_SAMPLE_CHAPTER_RU,
      stylePreset: detectStyleFromText(raw, params.preferredStyle),
      heroName: params.preferredHeroName,
    };
  }

  if (!params.hasSession) {
    if (raw.length >= 45) {
      return {
        kind: "start_book",
        scenarioText: raw,
        stylePreset: detectStyleFromText(raw, params.preferredStyle),
        heroName: params.preferredHeroName,
      };
    }
    if (/\?/.test(raw) || /привет|здравств|что\s+делать|с\s+чего\s+начать/.test(lower)) {
      return {
        kind: "explain_plan",
        targetItemId: detectTargetItemIdFromText(raw),
      };
    }
    return {
      kind: "start_book",
      scenarioText: DEFAULT_SAMPLE_CHAPTER_RU,
      stylePreset: detectStyleFromText(raw, params.preferredStyle),
      heroName: params.preferredHeroName,
    };
  }

  // 3. Reroll shot after final film
  if (params.hasFinalJob && /пересним|переснят|дубль|reroll/.test(lower)) {
    return {
      kind: "reroll_shot",
      shotIndex: parseShotOrdinalOneBased(raw) ?? 1,
    };
  }

  // 4. Approve final film
  if (
    params.hasShots &&
    /утверждаю|утвердить|выпускай\s+(?:финальн[а-яё]*\s+)?фильм|запускай\s+(?:финальн[а-яё]*\s+)?(?:фильм|рендер|v2v)|снимаем\s+чистовик|согласен\s+со\s+сметой/.test(
      lower
    )
  ) {
    return { kind: "approve_film" };
  }

  // 5. Edit draft cut (camera angle, delete shot, rename title, or update line)
  const cam = detectCameraModeFromText(raw);
  const ordinal = parseShotOrdinalOneBased(raw);
  if (params.hasShots && /удал[а-яё]*|убер[а-яё]*|выреж[а-яё]*/.test(lower) && ordinal !== undefined) {
    return { kind: "edit_draft", shotIndex: ordinal, deleteShot: true };
  }
  const titleMatch = raw.match(/(?:назови\s+фильм|название\s+фильма)\s+[«"]?([^»"]+)[»"]?/i);
  if (params.hasShots && titleMatch) {
    return { kind: "edit_draft", customTitle: titleMatch[1].trim() };
  }
  const lineMatch = raw.match(/(?:реплик[а-яё]*|скаж[а-яё]*)\s*:\s*[«"]?(.+?)[»"]?$/i);
  if (params.hasShots && (cam !== undefined || (ordinal !== undefined && lineMatch))) {
    return {
      kind: "edit_draft",
      shotIndex: ordinal ?? 1,
      cameraMode: cam,
      dialogueText: lineMatch?.[1]?.trim(),
    };
  }

  // 6. Build 3-act draft / animatic + estimate
  if (
    params.hasShots &&
    /собер[а-яё]*\s+(?:черновик|аниматик|фильм|монтаж)|сдела[а-яё]*\s+(?:черновик|аниматик)|перейти\s+к\s+(?:черновик|монтаж|смет)|покаж[а-яё]*\s+смет/.test(
      lower
    )
  ) {
    return { kind: "build_draft" };
  }

  // 7. Default inside active session -> play next 2d6 story turn!
  return { kind: "play_turn", playerInput: raw };
}
