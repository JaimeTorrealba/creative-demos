<script setup lang="ts">
import 'keyrune/css/keyrune.min.css'
import 'mana-font/css/mana.min.css'
import { computed, useId } from 'vue'

// A modern-frame (M15-style) Magic card face, built entirely from text and CSS so
// every word on it can be changed from data. Mana symbols, the set symbol and the
// artist brush come from the mana-font and keyrune icon fonts rather than images.
//
// Every measurement below is in cqw — percent of the card's own width — which makes
// the layout a pure function of that width: the card scales down as a whole and
// nothing inside it ever reflows. The numbers were taken off a 672 × 936 scan of a
// real card, so 1cqw is 6.72 px of that reference.

export interface MagicCard {
  name: string
  // mana-font keys, one per symbol: ['1', 'u'] renders {1}{U}.
  cost: string[]
  // Frame colour, blue when left out. Modern frame only.
  color?: 'blue' | 'red'
  typeLine: string
  // keyrune set key, e.g. 'grn' for Guilds of Ravnica.
  setCode: string
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic'
  // One entry per rules paragraph. {key} prints a mana-font symbol inline, e.g. {tap};
  // (parenthesised) reminder text is set in italics.
  rules: string[]
  // Rules text size in cqw, for cards with more text than the default 4.8 fits.
  rulesSize?: number
  // A line break puts the attribution on its own line.
  flavor?: string
  // mana-font key printed large in an empty text box, as on basic lands. Old frame only.
  watermark?: string
  power?: string
  toughness?: string
  collectorNumber: string
  rarityLetter: string
  setLabel: string
  language: string
  artist: string
  copyright: string
}

const props = defineProps<{ card: MagicCard }>()

// Filter ids are document-global, so they are namespaced per instance to let
// several cards share a page without picking up each other's noise.
const uid = useId()
const frameNoise = `${uid}-frame-noise`
const paleNoise = `${uid}-pale-noise`

const hasPowerToughness = computed(
  () => props.card.power !== undefined && props.card.toughness !== undefined
)

// The frame grain per colour: the blue frame is stretched into watery streaks, the red
// one is a fine even speckle. Each is a light layer where the noise peaks and a dark one
// where it dips.
const frameGrains = {
  blue: {
    frequency: '0.006 0.032',
    light: '0 0 0 0 0.78  0 0 0 0 0.92  0 0 0 0 1  1.9 0 0 0 -0.9',
    dark: '0 0 0 0 0.02  0 0 0 0 0.22  0 0 0 0 0.45  -1.9 0 0 0 0.8'
  },
  red: {
    frequency: '0.05 0.05',
    light: '0 0 0 0 1  0 0 0 0 0.86  0 0 0 0 0.82  2.6 0 0 0 -1.5',
    dark: '0 0 0 0 0.35  0 0 0 0 0.04  0 0 0 0 0.03  -2.2 0 0 0 0.85'
  }
}
const color = computed(() => props.card.color ?? 'blue')
const frameGrain = computed(() => frameGrains[color.value])

// Each paragraph as runs of plain and reminder (italic) text, each run as text and
// inline symbols. Symbols can sit inside reminder text, so the parentheses are split
// out first.
interface RulesRun {
  italic: boolean
  parts: { text?: string; symbol?: string }[]
}
const splitSymbols = (text: string) =>
  text
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((part) => (part.startsWith('{') ? { symbol: part.slice(1, -1) } : { text: part }))

const rules = computed<RulesRun[][]>(() =>
  props.card.rules.map((paragraph) =>
    paragraph
      .split(/(\([^)]*\))/)
      .filter(Boolean)
      .map((run) => ({ italic: run.startsWith('('), parts: splitSymbols(run) }))
  )
)
</script>

<template>
  <article
    class="card-face"
    :class="`card-face--${color}`"
    :style="card.rulesSize ? { '--rules-size': `${card.rulesSize}cqw` } : undefined"
  >
    <!-- Shared noise filters. Each textured surface draws a rect through one of
         these inside its own viewBox'd svg, so the grain is measured in card units
         and scales with the card instead of staying fixed in screen pixels. -->
    <svg class="defs" aria-hidden="true">
      <defs>
        <!-- The frame grain, tuned per colour in frameGrains. -->
        <filter
          :id="frameNoise"
          x="0"
          y="0"
          width="100%"
          height="100%"
          color-interpolation-filters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            :baseFrequency="frameGrain.frequency"
            numOctaves="4"
            seed="7"
            result="noise"
          />
          <feColorMatrix in="noise" result="light" type="matrix" :values="frameGrain.light" />
          <feColorMatrix in="noise" result="dark" type="matrix" :values="frameGrain.dark" />
          <feMerge>
            <feMergeNode in="dark" />
            <feMergeNode in="light" />
          </feMerge>
        </filter>

        <!-- Finer, fainter mottle for the pale title, type and text boxes. -->
        <filter
          :id="paleNoise"
          x="0"
          y="0"
          width="100%"
          height="100%"
          color-interpolation-filters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.01 0.045" numOctaves="3" seed="3" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.5 0 0 0 -0.6" />
        </filter>
      </defs>
    </svg>

    <div class="frame">
      <svg
        class="noise noise--frame"
        viewBox="0 0 618 840"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect width="100%" height="100%" :filter="`url(#${frameNoise})`" />
      </svg>

      <header class="bar">
        <svg class="noise" viewBox="0 0 598 56" preserveAspectRatio="none" aria-hidden="true">
          <rect width="100%" height="100%" :filter="`url(#${paleNoise})`" />
        </svg>
        <h2 class="name">{{ card.name }}</h2>
        <span class="cost">
          <i
            v-for="(symbol, index) in card.cost"
            :key="index"
            class="ms ms-cost ms-shadow"
            :class="`ms-${symbol}`"
          />
        </span>
      </header>

      <div class="art-window">
        <!-- Reserved for the card art; the Tres scene fills this slot later. -->
        <slot name="art"><div class="art" /></slot>
      </div>

      <div class="bar bar--type">
        <svg class="noise" viewBox="0 0 598 52" preserveAspectRatio="none" aria-hidden="true">
          <rect width="100%" height="100%" :filter="`url(#${paleNoise})`" />
        </svg>
        <span class="type-line">{{ card.typeLine }}</span>
        <i class="ss set-symbol" :class="[`ss-${card.setCode}`, `ss-${card.rarity}`]" />
      </div>

      <div class="text-box">
        <svg class="noise" viewBox="0 0 578 275" preserveAspectRatio="none" aria-hidden="true">
          <rect width="100%" height="100%" :filter="`url(#${paleNoise})`" />
        </svg>
        <div class="rules">
          <p v-for="(paragraph, index) in rules" :key="index">
            <component :is="run.italic ? 'em' : 'span'" v-for="(run, r) in paragraph" :key="r">
              <template v-for="(part, p) in run.parts" :key="p">
                <i v-if="part.symbol" class="ms ms-cost inline-symbol" :class="`ms-${part.symbol}`" />
                <template v-else>{{ part.text }}</template>
              </template>
            </component>
          </p>
          <template v-if="card.flavor">
            <hr class="flavor-bar" />
            <p class="flavor">{{ card.flavor }}</p>
          </template>
        </div>
      </div>
    </div>

    <div v-if="hasPowerToughness" class="pt">
      <svg class="noise" viewBox="0 0 114 48" preserveAspectRatio="none" aria-hidden="true">
        <rect width="100%" height="100%" :filter="`url(#${paleNoise})`" />
      </svg>
      <span>{{ card.power }}/{{ card.toughness }}</span>
    </div>

    <footer class="info">
      <div>
        <div>{{ card.collectorNumber }} {{ card.rarityLetter }}</div>
        <div>
          {{ card.setLabel }} &bull; {{ card.language }}
          <i class="ms ms-artist-brush" />
          <span class="artist">{{ card.artist }}</span>
        </div>
      </div>
      <div class="copyright">{{ card.copyright }}</div>
    </footer>
  </article>
</template>

<style scoped>
.card-face {
  /* Frame colours as variables so other colours of card are a swap, not a rewrite. */
  --border: #171314;
  --frame-light: #2c90d6;
  --frame-mid: #1670b6;
  --frame-deep: #1b7cc2;
  --frame-edge: #0b4a82;
  --pale-top: #dce8f1;
  --pale-bottom: #bccfdd;
  --pale-box: #d7e4ef;
  --pale-shade: #7f9db3;
  --pt-border: #8fb1ca;
  --bar-outline: #0f2b44;
  --art-outline: #0a2f52;
  --box-outline: #0e3b64;
  --ink: #111;

  container-type: inline-size;
  position: relative;
  width: 100%;
  aspect-ratio: 63 / 88;
  overflow: hidden;
  border-radius: inherit;
  background: var(--border);
  color: var(--ink);
}

.card-face--red {
  --frame-light: #d4432f;
  --frame-mid: #b82c22;
  --frame-deep: #c33a2b;
  --frame-edge: #6e1510;
  --pale-top: #f8e8e0;
  --pale-bottom: #e8c4b6;
  --pale-box: #f4e2d9;
  --pale-shade: #b98474;
  --pt-border: #d9a898;
  --bar-outline: #4a120d;
  --art-outline: #4a120d;
  --box-outline: #5a1a12;
}

.defs {
  /* Not display: none — Firefox drops filters defined inside a hidden svg. */
  position: absolute;
  width: 0;
  height: 0;
}

.noise {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.55;
}

.noise--frame {
  opacity: 0.7;
}

/* Everything stacked on top of a noise layer needs its own stacking position. */
.bar > :not(.noise),
.rules,
.pt > span {
  position: relative;
}

/* --- Blue frame ----------------------------------------------------------- */

.frame {
  position: absolute;
  top: 4cqw;
  left: 4cqw;
  width: 92cqw;
  height: 125cqw;
  display: grid;
  grid-template-rows: 8.3cqw 63.2cqw 7.7cqw 40.9cqw;
  row-gap: 0.4cqw;
  padding: 2.25cqw 1.5cqw 0;
  border-radius: 2.5cqw 2.5cqw 0.8cqw 0.8cqw;
  background: linear-gradient(
    172deg,
    var(--frame-light),
    var(--frame-mid) 38%,
    var(--frame-deep) 68%,
    var(--frame-light)
  );
  box-shadow: inset 0 0 0 0.25cqw var(--frame-edge);
}

/* --- Title and type bars -------------------------------------------------- */

.bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1cqw;
  padding: 0 1.8cqw 0 2.9cqw;
  overflow: hidden;
  border-radius: 2.6cqw / 50%;
  background: linear-gradient(var(--pale-top), var(--pale-bottom));
  box-shadow:
    0 0 0 0.35cqw var(--bar-outline),
    inset 0 0.35cqw 0 #ffffffb0,
    inset 0 -0.35cqw 0 var(--pale-shade);
}

.name,
.type-line {
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  font-family: 'Vollkorn', Georgia, serif;
  font-weight: 700;
  font-size: 5cqw;
  line-height: 1;
  color: var(--ink);
}

.type-line {
  font-size: 4.6cqw;
}

.cost {
  display: flex;
  gap: 0.35cqw;
  font-size: 2.95cqw;
}

.set-symbol {
  font-size: 4.8cqw;
}

/* --- Art window ----------------------------------------------------------- */

.art-window {
  position: relative;
  margin: 0 1.5cqw;
  overflow: hidden;
  background: #000;
  box-shadow: 0 0 0 0.3cqw var(--art-outline);
}

.art {
  width: 100%;
  height: 100%;
  background: #000;
}

/* --- Text box ------------------------------------------------------------- */

.text-box {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0 1.5cqw;
  padding: 0 3cqw 0 1.6cqw;
  overflow: hidden;
  background: var(--pale-box);
  box-shadow:
    0 0 0 0.3cqw var(--box-outline),
    inset 0 0.5cqw 0.8cqw #0000002a;
}

.rules {
  font-family: 'Crimson Pro', 'Times New Roman', serif;
  font-size: var(--rules-size, 4.8cqw);
  line-height: 1.12;
  color: var(--ink);
}

/* Mana symbols inside a line of rules text, sized to sit on the text like a capital. */
.inline-symbol {
  font-size: 0.62em;
  vertical-align: 0.15em;
}

.rules p {
  margin: 0;
}

.rules p + p {
  margin-top: 1.2cqw;
}

/* The thin rule printed between rules text and flavor text, fading at both ends. */
.flavor-bar {
  height: 0.18cqw;
  margin: 2cqw 0.4cqw 1.8cqw;
  border: 0;
  background: linear-gradient(90deg, transparent, #00000070 12%, #00000070 88%, transparent);
}

.flavor {
  font-style: italic;
  white-space: pre-line;
}

/* --- Power / toughness ---------------------------------------------------- */

.pt {
  position: absolute;
  top: 123.8cqw;
  left: 77.4cqw;
  width: 16.9cqw;
  height: 7.2cqw;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 0.8cqw solid var(--pt-border);
  border-radius: 2.2cqw 1.4cqw 1.4cqw 1.4cqw;
  background: linear-gradient(var(--pale-top), var(--pale-bottom));
  box-shadow:
    0 0 0 0.3cqw var(--bar-outline),
    inset 0 0 0 0.25cqw var(--bar-outline);
  font-family: 'Vollkorn', Georgia, serif;
  font-weight: 700;
  font-size: 5.2cqw;
  line-height: 1;
}

/* --- Collector info on the black bottom border ---------------------------- */

.info {
  position: absolute;
  top: 130.5cqw;
  left: 6.7cqw;
  right: 6.5cqw;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  font-family: 'Montserrat', system-ui, sans-serif;
  font-weight: 500;
  font-size: 1.95cqw;
  line-height: 1.3;
  letter-spacing: 0.02em;
  color: #ececec;
}

.artist {
  font-weight: 600;
  font-variant: small-caps;
  font-size: 1.15em;
  line-height: 1;
}

.copyright {
  font-size: 1.8cqw;
}
</style>
