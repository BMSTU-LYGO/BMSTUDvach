# P2-T1b — Камера и указатель в `src/three/archive/space.ts`

STATUS: DONE

FILES_CHANGED:
- `frontend/src/three/archive/space.ts` (изменён) — к готовому графу P2-T1 добавлены
  camera rig и pointer-контракт. Ни один существующий метод не поменял поведения
  (`setStories/update/dispose` — тот же контракт, те же эффекты).
- `frontend/src/three/archive/__tests__/space.spec.ts` (изменён) — 23 существовавших
  кейса сохранены без правок, добавлено 12 новых (всего 25).

VERIFICATION:
- `npm run verify:3d` → OK, 46/46 структурных 3D-проверок (guard'ы не тронуты).
- `npm run lint` → OK, `eslint . --max-warnings 0` — 0 ошибок, 0 предупреждений.
- `npm run build` → OK, `vue-tsc --noEmit` + `vite build`; `three` остался в отдельном
  чанке (`dist/assets/three-*.js`), осталось только штатное предупреждение Vite про
  чанк >500 kB.
- `npm run test` → OK, 57 файлов / 763 теста прошли (было 57/751 — +12 моих тестов;
  остальная дельта — параллельная задача P3-T1). Изолированно:
  `npx vitest run src/three/archive/__tests__/space.spec.ts` → 25 passed.
- `npx prettier --check` по обоим моим файлам → clean (формат приведён к `.prettierrc`).
- Проверки из промпта: рантайм-импорта `three` в `space.ts` нет (только `import type`),
  `Math.random` не встречается (кроме упоминания в комментарии), `three`-модуль
  по-прежнему передаётся снаружи (`three: ThreeModule`).

SUMMARY:

## Что сделано

**1. Контроллер — 7 новых методов** (`ArchiveSpaceController`):
`focus(id)` / `travelToFocus(durationMs = 650)` / `releaseFocus()` / `setPointer(x, y)` /
`pointerStoryId()` / `openStory(id)` / `orbitBy(dx, dy)`.
Плюс новый экспорт `ArchiveOpenResult { id, from: {x,y,z}, to: {x,y,z} }` и аддитивная
опция `ArchiveSpaceOptions.reducedMotion`.

**2. Camera rig внутри `buildArchiveSpace`** (вместо статичной позы):
- состояние орбиты `orbit = { phase: Math.PI/2, radius: 12.5, height: 2.2, lookY: 0 }` —
  старт совпадает с platinum-пресетом `network.ts` (`0, 2.2, 12.5`), камера не прыгает
  при смене маршрута;
- idle-режим: `orbit.phase += dt * ORBIT_SPEED` (0.05 рад/с), вертикальный bob
  `sin(elapsed * ORBIT_BOB_SPEED) * ORBIT_BOB` (0.1 / 0.5), `camera.lookAt` в ядро;
- `travel`: интерполяция `from → to` по локальной копии `easeInOutCubic` (как в
  `network.ts`), look-at интерполируется вместе с позицией; во время `traveling === true`
  idle-орбита и `orbitBy` игнорируются; по завершении орбита **re-anchor'ится** из
  финальной позы (`phase = atan2(z, x)`, `radius = hypot(x, z)`, `height = y − bob`),
  поэтому скачка нет;
- `focus(id)`: только запоминает id и цель, **камеру не двигает**;
- `travelToFocus()`: поза «напротив» пластинки — позиция фрагмента + 2.6 наружу по
  радиальному направлению от ядра, на 0.6 выше; `lookAt` = сама пластинка (берётся её
  живая world-позиция через `mesh.getWorldPosition` в переиспользуемый `Vector3`, так что
  камера следует за дрейфом пластинки);
- `releaseFocus()`: travel обратно к idle-позе текущей фазы орбиты;
- `openStory(id)`: `null`, если фрагмента нет; иначе `focus` + `travelToFocus` и возврат
  `{ id, from, to }` — view использует это для кинематографичного перехода;
- `orbitBy(dx, dy)`: `phase += dx * 0.005`, `height = clamp(height + dy * 0.01, -1.5, 6)`;
  во время travel игнорируется (travel приоритетнее).

**3. Raycast указателя:**
`new three.Raycaster()`, `pointerNdc = new three.Vector2(999, 999)`; список целей —
`fragmentMeshes: Mesh[]`, синхронный с `clearFragments/setStories`; луч — раз в
`RAYCAST_INTERVAL = 3` кадра либо сразу после изменения указателя; `raycaster.setFromCamera`
+ `intersectObjects(fragmentMeshes, false)`, первый hit → `userData.storyId` (проверяется
`visible`); новое значение публикуется только после **двух совпавших проверок подряд**
(дебаунс от дрожания на ребрах). Hover сам по себе `focus()` не меняет — это делает
канвас/view через событие. Указатель не меняет фокус и не трогает камеру.

**4. `update(dt, snap)`:**
presence-lerp и uniforms-униформы оставлены как есть; добавлено:
- синхронизация внешнего фокуса: `snap.focusedStory` применяется **только когда он реально
  изменился** (гейт `syncedFocus`) — локальный `focus(id)` не затирается повторяющимся
  снапшотом, и камера при этом не прыгает (travel инициирует только явный `travelToFocus`);
- при `snap.reducedMotion` (или `opts.reducedMotion`) замирают idle-орбита, дрейф
  пластин, вращение колец и дыхание halo, travel мгновенный (1 кадр), но `update` целиком
  не останавливается — униформы, presence и raycast продолжают доходить;
- в горячем цикле нет аллокаций `Vector2/Vector3/Mesh`: все векторы и позы
  переиспользуемые, поиск пластинки — через `Map<number, FragmentNode>` (без замыкания
  в кадре), `intersectObjects` вызывается не чаще раза в 3 кадра.

**5. `dispose()`:** прежняя идемпотентность и возврат геометрий/материалов сохранены;
добавлен сброс состояния rig'а (travel/hold/focus/hover, списки пластин обнулены).
Ресурсов у камеры нет — `raycaster` чистить не нужно.

**6. Тесты (`space.spec.ts`), новые кейсы:**
- `focus(1) → travelToFocus()` + 40 кадров → камера ближе к пластинке #1 (дистанция
  падает с ~10 до ~2.7);
- тот же travel при `reducedMotion: true` → поза достигнута за 1 кадр;
- `releaseFocus()` → `camera.position.z` ≈ 12.5 (проверено с допуском 0.6);
- `orbitBy(100, 0)` меняет азимут камеры; `orbitBy` во время travel игнорируется
  (два рига дают идентичную финальную позицию);
- `openStory(999)` → `null`; `openStory(1)` → `from`/`to` с конечными числами;
- `setPointer` в NDC пластинки (world-позиция → `v.project(camera)`) → после `update()`
  `pointerStoryId() === 1`; в «пустое» место (зеркальная NDC) → `null`; без движения
  указателя → `null`;
- внешний `snap.focusedStory` синхронизирует фокус **без прыжка камеры** (позиция
  совпадает с контрольным ригом без фокуса) и при этом архив знает, куда лететь;
- `focus(id)` сам по себе не двигает камеру;
- если сфокусированная пластинка исчезла (сменился набор историй), камера плавно
  возвращается на idle-орбиту.

## Отклонения от промпта (осознанные)

1. **Re-anchor после travel к фрагменту не выполняется** — вместо этого орбита
   «замораживается» на время фокуса. Причина: re-anchor от фокусной позы увёл бы
   idle-орбиту на радиус ~2 и азимут пластинки, и `releaseFocus()` возвращал бы камеру
   не к обзорной орбите архива (z ≈ 12.5), а к тесному кругу вокруг ядра. Re-anchor
   применяется ко всем travel'ам, заканчивающимся в idle-позе (release и возврат с
   исчезнувшей пластинки) — там он честно выполняется.
2. **`focus(id)` не отпускает «залипшую» камеру** — как и просили, он только выбирает
   цель и не двигает камеру; освобождает камеру `releaseFocus()`.
3. **`orbitBy` применён к состоянию орбиты без dt-множителя** — drag приходит из
   событий указателя, а не из кадра, поэтому дельта применяется сразу (0.005 рад на
   единицу dx, 0.01 на единицу dy, высота зажата в [-1.5, 6]); «затухание инерции»
   вынесено в то, что камера каждый кадр пересобирает позу из состояния орбиты.
4. В `ArchiveSpaceOptions` добавлен флаг `reducedMotion` (аддитивно) — чтобы сцену
   можно было запустить в тихом режиме без снапшота.

## BLOCKERS

- Нет.

## FOLLOWUPS

- P2-T3 (`ArchiveSpaceCanvas.vue`): вью должен вызывать `setPointer` (NDC из
  `pointermove` относительно bounding box канваса) и на `pointerStoryId()` публиковать
  `focusStory(id)` + `emitSceneEvent('archive-focus')`; клик по пластинке — `openStory(id)`
  и переход на `/platinum/:id` (P3-T1).
- P3-T3/P3-T4: `openStory()` уже отдаёт `from`/`to` — их можно использовать как
  shared-элемент кинематографичного перехода `platinum ↔ story`.
- P4-T1: `focus()`/`travelToFocus()` — естественный хук для клавиатурной навигации по
  списку (3D лишь следует за фокусом).
- P4-T2: стоит завести общий `BufferGeometry`/инстансинг пластин и отключать dust на
  `low`; raycast сейчас трогает `scene.updateMatrixWorld(true)` раз в 3 кадра — при
  большем числе пластин это стоит пересмотреть (возможно, `updateMatrixWorld` только
  для `world`).
- Идея (вне scope): «инерция» drag'а (накопление скорости с затуханием) — если нужна,
  её лучше делать в канвасе (P2-T3), а не в rig'е.
