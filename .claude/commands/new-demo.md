---
description: Scaffold a new demo — component folder, view, and route — using the WallOfMist structure
argument-hint: <demo name> e.g. "Drifting Shards" or drifting-shards
allowed-tools: Bash(ls:*), Bash(cat:*), Bash(mkdir:*), Bash(git status:*), Read, Edit, Write, Glob, Grep
---

Scaffold a new demo named: **$ARGUMENTS**

If no name was given, stop and ask for one. Do not invent a demo name.

This produces the same three-part structure every demo in this project uses. The templates
below are a frozen snapshot of the WallOfMist scaffold — use them as written rather than
copying the current `wall-of-mist` files, which will have filled up with demo-specific code.

## Step 1 — Derive the names

From the supplied name, derive all three forms. Accept "Drifting Shards", "drifting-shards",
or "DriftingShards" as input and normalize:

| Form | Example | Used for |
|---|---|---|
| PascalCase | `DriftingShards` | view file `src/views/DriftingShardsView.vue`, import name |
| kebab-case | `drifting-shards` | component folder, route path, route name |

Strip any trailing "View" or "Demo" the user may have typed. State the derived names before
creating anything.

## Step 2 — Preflight

```
ls src/views/ src/components/demos/
```

If the view file, the component folder, or the route name already exists, **stop and report the
collision**. Do not overwrite an existing demo and do not silently pick a variant name.

## Step 3 — Component

Create `src/components/demos/<kebab-name>/index.vue`. This is `TheExperience`: it owns scene
content only, and carries a top-level `await` so the `<Suspense>` wrapper in the view is
meaningful.

```vue
<script setup lang="ts">
import { isWebGPURenderer, useTresContext } from '@tresjs/core'
import { mix, uv, vec3 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { onUnmounted } from 'vue'

// Node materials only compile once the WebGPU backend is up, so wait for it.
// The top-level await is what makes the <Suspense> wrapper in the view meaningful.
const { renderer } = useTresContext()
if (isWebGPURenderer(renderer.instance)) await renderer.instance.init()

const material = new MeshBasicNodeMaterial()
material.colorNode = mix(vec3(0.1, 0.1, 0.15), vec3(0.75, 0.5, 1.0), uv().y)

onUnmounted(() => material.dispose())
</script>

<template>
  <TresMesh :position="[0, 0, -2]" :material="material">
    <TresPlaneGeometry :args="[4, 3]" />
  </TresMesh>
</template>
```

## Step 4 — View

Create `src/views/<PascalName>View.vue`, replacing `<kebab-name>` in the import path.

```vue
<script setup lang="ts">
import { OrbitControls } from '@tresjs/cientos'
import { TresCanvas, type TresRendererSetupContext } from '@tresjs/core'
import { WebGPURenderer } from 'three/webgpu'
import { toValue } from 'vue'
import TheExperience from '../components/demos/<kebab-name>/index.vue'

const createRenderer = (ctx: TresRendererSetupContext) =>
  new WebGPURenderer({
    canvas: toValue(ctx.canvas),
    alpha: true,
    antialias: true
  })
</script>

<template>
  <TresCanvas window-size clear-color="#333" :renderer="createRenderer">
    <TresPerspectiveCamera :position="[0, 0, 5]" :look-at="[0, 0, 0]" />
    <OrbitControls />

    <TresMesh>
      <TresBoxGeometry :args="[1, 1, 1]" />
      <TresMeshBasicMaterial color="#c084fc" />
    </TresMesh>

    <Suspense>
      <TheExperience />
    </Suspense>

    <TresAmbientLight :intensity="0.2" />
    <TresDirectionalLight :position="[5, 5, 5]" :intensity="1" />
  </TresCanvas>
</template>
```

## Step 5 — Route

Add to `src/router/index.ts`, lazy-imported like the existing demo routes:

```ts
{
  path: '/<kebab-name>',
  name: '<kebab-name>',
  component: () => import('../views/<PascalName>View.vue')
}
```

**Insert it before the `/:pathMatch(.*)*` catch-all.** That route matches everything, so
anything placed after it is unreachable. Leave `HomeView.vue` alone — demos are reached by URL
in this project.

## Conventions these templates encode

Keep these if you adapt the scaffold; they are why it is shaped this way.

- **The view owns the frame, the component owns the content.** Canvas, renderer, camera,
  `OrbitControls` and lights live in the view. Scene objects live in `index.vue`. Do not move
  canvas setup into the component.
- **No `@` alias exists** in this project — imports are relative (`../components/demos/...`).
- **Node materials are built imperatively** and bound with `:material`. The Tres catalogue comes
  from `three`'s exports, so `<TresMeshBasicNodeMaterial>` will not resolve as a tag.
- **`WebGPURenderer` is passed as a factory**, `(ctx) => new WebGPURenderer(...)`, not an
  instance. TresJS calls it with a `TresRendererSetupContext`.
- **`#c084fc`** is the dark-mode `--accent` from `src/style.css`. Fine to change per demo.
- **`.prettierrc.json`**: no semicolons, single quotes, 2-space, width 100, no trailing commas.
- Already configured once, globally — do not redo per demo: `templateCompilerOptions` in
  `vite.config.ts`, and `@types/three` pinned to `0.184.x` (`0.186` breaks TresJS's array
  shorthand for `:position`).

## Step 6 — Report, and stop

List the three files created and the route path. Then **stop**.

Per `CLAUDE.md`: do not run a type check, lint, build, or dev server to confirm the scaffold,
and do not open a browser. Verification is the user's manual step via `/verify`. Say the demo
is ready at `/<kebab-name>` and leave it there.

If the user asked for specific demo content along with the name, build that into `index.vue`
instead of the placeholder gradient plane — the scaffold is a starting point, not a constraint.
