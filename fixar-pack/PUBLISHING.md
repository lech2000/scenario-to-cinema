# Публикация пака `cinema-rpg/book-to-film-rpg@0.1.0` в каталог ФиксАР

Архив декларативного пака собирается и проходит живую проверку схемы ФиксАР одной командой:

```bash
npm run pack:validate
```

Скрипт:
1. Собирает неизменяемый архив `fixar-pack/dist/book-to-film-rpg-0.1.0.tar.gz` и контрольную сумму `book-to-film-rpg-0.1.0.tar.gz.sha256`.
2. Отправляет `fixar-pack/pack.yaml` и `fixar-pack/domains/book-to-film-rpg.yaml` в живой валидатор `POST https://api.agrigate.pro/registry/validate` и проверяет ответ `{"ok": true, "полное_имя": "cinema-rpg/book-to-film-rpg@0.1.0"}`.

## Подача релиза `v0.1.0` в Кабинете автора (`/pak/kabinet/`)

По правилам реестра ФиксАР (`services/landscape_service/registry.py`):
1. **Заявка издателя** (однократно в https://agrigate.pro/pak/kabinet/):
   - Пространство имён (`namespace`): `cinema-rpg`
   - Отображаемое имя (`display_name`): `Cinema RPG Studio`
   - Допуск выдаётся площадкой после сверки документов автора (`steward_documents`, срок разбора — до 24 ч).
2. **Подача версии `0.1.0`**:
   - Вставьте содержимое `fixar-pack/pack.yaml` в форму подачи версии (`POST /registry/versions`).
   - Прикрепите ссылку на релизный архив GitHub Release `v0.1.0`:
     `https://github.com/lech2000/scenario-to-cinema/releases/download/v0.1.0/book-to-film-rpg-0.1.0.tar.gz`
   - Укажите SHA-256 из файла `book-to-film-rpg-0.1.0.tar.gz.sha256` (сверяется карантинным сканером `pack_artifacts` перед переводом в `promoted` → `approved`, срок разбора — до 72 ч).
