КУДА КЛАСТЬ ЗВУКИ
=================

Положите файл в нужную папку с нужным именем — и звук заработает сам, код менять не нужно.
Форматы: .mp3 (лучше всего), .ogg или .wav. Если файла нет, этот звук просто не играет.
Если положили файл, а в игре его нет: перезапустите `node tools/serve.mjs` и обновите страницу (Ctrl+F5).
Перед выкладкой на Яндекс выполните `npm run build` — файлы попадут в архив сами.

Советы: короткие эффекты (до 2–3 секунд) и небольшой размер (десятки КБ).
Музыка — любая длина, лучше 96–128 кбит/с, чтобы игра грузилась быстро.


ИНТЕРФЕЙС            папка assets/sounds/ui/
  click.mp3            нажатие кнопки
  ready.mp3            юнит или рабочий готов
  error.mp3            ошибка (мало ресурсов, нельзя строить)
  select.mp3           выбор юнита (если нет — играет click)
  order.mp3            отдан приказ (если нет — играет click)
  build_complete.mp3   здание построено
  alert.mp3            ТРЕВОГА: предупреждение о волне, выход босса
  wave_start.mp3       началась волна врагов (если нет — играет alert)
  victory.mp3          победа
  defeat.mp3           поражение

ЗДАНИЯ               папка assets/sounds/buildings/
  explosion.mp3        взрыв (отмена стройки)
  build_start.mp3      начало стройки
  build_complete.mp3   стройка закончена
  click_building.mp3   выбор здания
  cc_ready.mp3         рабочий (КСМ) готов
  barracks_ready.mp3   боец из казармы готов
  factory_ready.mp3    техника с завода готова
  starport_ready.mp3   корабль из космопорта готов

ЮНИТЫ                папка assets/sounds/units/
  <юнит>_shoot.mp3     выстрел
  <юнит>_death.mp3     смерть
  turret_shoot.mp3     выстрел туррели (если нет — звук выстрела танка)
  medic_heal.mp3       лечение медика
  scv_death.mp3        смерть рабочего
  Вместо <юнит>: marine, marauder, ghost, medic, hellion, tank, thor, viking, banshee, battlecruiser

ГОЛОСА ЮНИТОВ        папка assets/sounds/voices/<юнит>/
  select.mp3           юнит выбран
  order.mp3            юниту отдали приказ
  Вместо <юнит>: scv, marine, marauder, ghost, medic, hellion, tank, thor, viking, banshee, battlecruiser
  Пример: assets/sounds/voices/thor/select.mp3

МУЗЫКА               папка assets/sounds/music/
  menu.mp3             главное меню
  classic.mp3          карта «Классика» (и запасная для остальных)
  canyon.mp3           карта «Каньон»
  islands.mp3          карта «Острова»
  labyrinth.mp3        карта «Открытая»
  survival.mp3         режим «Выживание» (если нет — играет labyrinth)
  battle.mp3           запасная боевая музыка (если нет — играет classic)
