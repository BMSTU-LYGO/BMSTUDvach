ЗАДАЧА: P2-T1b. Камера и указатель в `src/three/archive/space.ts` (добавить к готовому графу)
ЦЕЛЬ ПРОЕКТА: `/platinum/` как самостоятельное интерактивное Three.js Archive Space:
пространственная структура историй, camera focus, кинематографичное открытие истории.
ПРОЕКТ: /Users/timofey/Developer/Личные_проекты/BMSTUDvach, стек: Vue 3 + TS + Vite + Three.js 0.186.

КОНТЕКСТ: прочитай `.opencode/slave-work/PLAN.md` (разделы «Контекст для субагентов»,
«Общие правила», задачи P2-T1/P2-T1b/P2-T3). Затем прочитай ЦЕЛИКОМ:
- `src/three/archive/space.ts` — текущий граф (rings/fragments/vault/halo/dust,
  `ArchiveSpaceSnapshot`, `ArchiveSpaceController`, `buildArchiveSpace`, `unitOf`,
  `clearRings/clearFragments`, `setStories`, `update`, `dispose`);
- `src/three/archive/__tests__/space.spec.ts` — как тестировать (реальный three,
  мок `getContext`);
- `src/three/transitionDirector.ts` — `easeInOutCubic` (копию этой функции держи локально,
  как это уже сделано в network.ts);
- `src/three/network.ts` — ТОЛЬКО фрагмент с `Raycaster`, `setPointer`, `getNodeAtPointer`
  и `cameraPresets` (конвенция: NDC-указатель, ray.intersectObjects по списку mesh,
  camera preset platinum = `{ x: 0, y: 2.2, z: 12.5, lookY: 0 }`).

ЧТО СДЕЛАТЬ (править можно только 2 файла):
1. Расширить `ArchiveSpaceController` новыми методами (существующие не менять поведением):
   ```ts
   focus(id: number | null): void                  // выбрать фрагмент фокуса (не двигает камеру)
   travelToFocus(durationMs?: number): void        // плавный travel к текущему фокусу (дефолт 650ms)
   releaseFocus(): void                            // снять фокус и вернуться к idle-орбите
   setPointer(ndcX: number, ndcY: number): void    // NDC указателя (тот же контракт, что network.ts)
   pointerStoryId(): number | null                 // id под последним setPointer (или null)
   openStory(id: number): { id: number; from: {x:number;y:number;z:number}; to: {x:number;y:number;z:number} } | null
   orbitBy(dx: number, dy: number): void           // ручной дрейф камеры (drag), без OrbitControls
   ```
2. Camera rig внутри `buildArchiveSpace` (заменить статичную позу):
   - состояние орбиты: `orbit = { phase, radius, height, lookY }` со стартом
     `radius 12.5, height 2.2, phase = Math.PI/2` (чтобы стартовая поза совпала с
     platinum-пресетом network.ts — камера не «прыгает» при смене маршрута);
   - idle-режим: медленная орбита (`phase += dt * 0.05`, bob `sin(elapsed*0.1)*0.5` —
     константы вынеси наверх с именами вида `ORBIT_SPEED`, `ORBIT_BOB`), `camera.lookAt`
     в ядро (или в `lookY`);
   - `travel`: интерполяция `from → to` поeaseInOutCubic за `durationMs`; во время
     `traveling === true` idle-орбита и `orbitBy` игнорируются; по завершении —
     заанкорируй `phase`/`radius`/`height` из финальной позы (как делает re-anchor в
     network.ts), чтобы не было скачка;
   - `focus(id)`: хранит id и держит цель (позиция фрагмента из `FragmentNode` +
     world-позиция через `mesh.getWorldPosition` в переиспользуемый Vector3);
   - `travelToFocus()`: строит позу «напротив» фрагмента: точка = позиция фрагмента +
     наружу по радиальному направлению (от ядра) на ~2.6, чуть выше (y + 0.6);
     `lookAt` = сам фрагмент; длительность из аргумента; при `snap.reducedMotion` или
     `opts.reducedMotion` — мгновенно (1 кадр);
   - `releaseFocus()`: travel обратно к idle-позе текущей фазы орбиты;
   - `openStory(id)`: если фрагмента нет → `null`; иначе ставит фокус, делает
     `travelToFocus()` и возвращает `{ id, from: текущая поза, to: целевая поза }`
     (view использует это для кинематографичного перехода);
   - `orbitBy(dx, dy)`: `phase += dx * 0.005`, `height = clamp(height + dy * 0.01,
     -1.5, 6)`; значения расходятся (инерция затухает через `dt`-домножение), travel
     приоритетнее.
3. Raycast:
   - `const raycaster = new three.Raycaster()`, `const pointerNdc = new three.Vector2(999, 999)`;
   - `setPointer` пишет в `pointerNdc`; raycast выполняй НЕ каждый кадр — раз в
     ~3 кадра (счётчик) или когда `pointerNdc` изменился с прошлого raycast;
   - цель — список mesh'ей пластин (держи `fragmentMeshes: Mesh[]` синхронно с
     `clearFragments/setStories`); `raycaster.setFromCamera(pointerNdc, camera)`,
     `intersectObjects(fragmentMeshes, false)`; первый hit → `userData.storyId`;
   - дебаунс: новое значение публикуется только если совпало 2 проверки подряд
     (защита от дрожания на ребрах);
   - `hover` сам по себе НЕ меняет `focus()` (это делает канвас/view через событие) —
     только `pointerStoryId()`;
   - учти: пластинки `depthWrite:false`, `side: DoubleSide` — raycast работает, но
     проверяй `visible`.
4. `update(dt, snap)` — вписать новую логику, сохранив текущую:
   - `presence`-lerp иMaterials-униформы оставить как есть;
   - если `snap.focusedStory` отличается от локального фокуса (view может менять фокус
     снаружи через `sceneState`), синхронизируй внутренний фокус (без travel: travel
     инициирует только явный вызов `travelToFocus`);
   - при `snap.reducedMotion === true`: idle-орбита и дрейф пластин замирают
     (не останавливай `update` целиком — униформы и presence всё ещё должны доходить),
     travel мгновенный;
   - никаких аллокаций Vector2/Vector3/Mesh в горячем цикле.
5. `dispose()` — освободить новые ресурсы (raycaster чистить не нужно, списки обнулить),
   идемпотентность сохранить.
6. Дополнить `src/three/archive/__tests__/space.spec.ts` (существующие кейсы не удалять):
   - `focus(1) → travelToFocus()` + 40 кадров: камера стала ближе к пластинке #1, чем была;
   - тот же travel при `reducedMotion: true` завершается за 1 кадр;
   - `releaseFocus()` возвращает `camera.position.z` к ~12.5 (±0.6);
   - `orbitBy(100, 0)` меняет азимут камеры, `orbitBy` во время travel игнорируется;
   - `openStory(несуществующий)` → `null`; `openStory(id)` возвращает `from`/`to` с
     конечными числами;
   - `setPointer` в экранные координаты пластинки (возьми её world-позицию, спроецируй
     через `camera.updateMatrixWorld(); v.project(camera)` → NDC) → после `update()`
     `pointerStoryId() === id`; в «пустое» место → `null`;
   - внешний `snap.focusedStory` синхронизирует фокус без прыжка камеры.

КРИТЕРИИ ПРИЁМКИ:
- 7 новых методов на контроллере, API `setStories/update/dispose` не сломаны;
- `npm run test` зелёный (spec ≥ прежних кейсов + новые), `npm run lint`, `npm run build`,
  `npm run verify:3d` зелёные;
- рантайм-импорт `three` отсутствует; `Math.random` не появился.

ВЕРИФИКАЦИЯ (из `frontend/`): `npm run verify:3d && npm run lint && npm run build && npm run test`

ГРАНИЦЫ: менять только `src/three/archive/space.ts` и
`src/three/archive/__tests__/space.spec.ts`. layout.ts/materials.ts/sceneState.ts/network.ts/
вью/канвасы — не трогать. Не коммитить/не пушить, PLAN.md не менять, вопросы не задавать.
Работай компактно: не перечитывай лишние файлы.

ОТЧЁТ: финальное сообщение + полностью запиши в `.opencode/slave-work/results/P2-T1b.md`:
STATUS / FILES_CHANGED / VERIFICATION / SUMMARY / BLOCKERS / FOLLOWUPS.
