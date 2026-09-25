<script setup lang="ts">
import 'keyrune/css/keyrune.min.css'
import 'mana-font/css/mana.min.css'
import { useId } from 'vue'
import type { MagicCard } from './card-face.vue'

// An old-frame (1997–2003) Magic card face: marbled stone frame, bevelled art window, white
// name and type set straight on the stone, and a coloured text box. Like CardFace it is
// built from text and CSS so every word can be changed from data. A card with no rules
// text shows its mana symbol as a watermark instead, the way basic lands were printed.
//
// Every measurement is in cqw, percent of the card's own width, taken off a 744 × 1039
// scan of an Invasion Forest, so 1cqw is 7.44 px of that reference.

defineProps<{ card: MagicCard }>()

// Filter ids are document-global, so they are namespaced per instance.
const uid = useId()
const stoneNoise = `${uid}-stone-noise`
const boxNoise = `${uid}-box-noise`
</script>

<template>
  <article class="classic-card-face">
    <svg class="defs" aria-hidden="true">
      <defs>
        <!-- Marbled grey-brown stone: pale clouds where the noise peaks, dark veins where
             it dips, laid over the frame's flat base colour. -->
        <filter
          :id="stoneNoise"
          x="0"
          y="0"
          width="100%"
          height="100%"
          color-interpolation-filters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009 0.014"
            numOctaves="5"
            seed="11"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            result="light"
            type="matrix"
            values="0 0 0 0 0.8  0 0 0 0 0.76  0 0 0 0 0.71  2.2 0 0 0 -1.05"
          />
          <feColorMatrix
            in="noise"
            result="dark"
            type="matrix"
            values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.21  -2.4 0 0 0 1"
          />
          <feMerge>
            <feMergeNode in="dark" />
            <feMergeNode in="light" />
          </feMerge>
        </filter>

        <!-- Soft yellow blotches over the pale green of the text box. -->
        <filter
          :id="boxNoise"
          x="0"
          y="0"
          width="100%"
          height="100%"
          color-interpolation-filters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="5" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.96  0 0 0 0 0.95  0 0 0 0 0.55  2 0 0 0 -0.85"
          />
        </filter>
      </defs>
    </svg>

    <div class="frame">
      <svg class="noise" viewBox="0 0 668 957" preserveAspectRatio="none" aria-hidden="true">
        <rect width="100%" height="100%" :filter="`url(#${stoneNoise})`" />
      </svg>
    </div>

    <h2 class="name">{{ card.name }}</h2>

    <div class="art-bevel">
      <div class="art-window">
        <slot name="art"><div class="art" /></slot>
      </div>
    </div>

    <div class="type-line">
      <span>{{ card.typeLine }}</span>
      <i class="ss set-symbol" :class="[`ss-${card.setCode}`, `ss-${card.rarity}`]" />
    </div>

    <div class="text-box">
      <svg class="noise" viewBox="0 0 598 302" preserveAspectRatio="none" aria-hidden="true">
        <rect width="100%" height="100%" :filter="`url(#${boxNoise})`" />
      </svg>
      <div v-if="card.rules.length" class="rules">
        <p v-for="(paragraph, index) in card.rules" :key="index">{{ paragraph }}</p>
        <p v-if="card.flavor" class="flavor">{{ card.flavor }}</p>
      </div>
      <i v-else-if="card.watermark" class="ms watermark" :class="`ms-${card.watermark}`" />
    </div>

    <footer class="info">
      <div class="illus">Illus. {{ card.artist }}</div>
      <div class="copyright">{{ card.copyright }} {{ card.collectorNumber }}</div>
    </footer>
  </article>
</template>

<style scoped>
.classic-card-face {
  --border: #0d0d0d;
  --stone: #958574;
  --rim-light: #8cc85e;
  --rim-dark: #1d2b15;
  --box: #d3e6a2;
  --box-border: #6aad3f;
  --symbol: #528e5b;
  --symbol-shadow: #a4a45c;

  container-type: inline-size;
  position: relative;
  width: 100%;
  aspect-ratio: 63 / 88;
  overflow: hidden;
  border-radius: inherit;
  background: var(--border);
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
}

/* Every text layer sits on the stone and reads off it in white with a hard black shadow. */
.name,
.type-line,
.info {
  position: absolute;
  margin: 0;
  color: #fff;
  text-shadow: 0.2cqw 0.2cqw 0 #000;
  line-height: 1;
}

/* --- Stone frame ---------------------------------------------------------- */

/* A light green rim and a dark line inside it, round a slab of marbled stone. */
.frame {
  position: absolute;
  top: 5.1cqw;
  left: 5.1cqw;
  width: 89.8cqw;
  height: 128.6cqw;
  overflow: hidden;
  background: var(--stone);
  box-shadow:
    0 0 0 0.35cqw var(--rim-light),
    inset 0 0 0 0.3cqw var(--rim-dark),
    inset 0.6cqw 0.6cqw 0.6cqw #00000040;
}

.frame .noise {
  opacity: 0.85;
}

.name {
  top: 6.3cqw;
  left: 10.8cqw;
  font-family: 'Almendra', 'Vollkorn', Georgia, serif;
  font-weight: 700;
  font-size: 5cqw;
}

/* --- Art window ----------------------------------------------------------- */

/* The bevel is lit from the bottom right, so the art reads as set into the stone. */
.art-bevel {
  position: absolute;
  top: 11.8cqw;
  left: 9.8cqw;
  width: 80.6cqw;
  height: 65.3cqw;
  box-sizing: border-box;
  border: 1.7cqw solid;
  border-color: #6c7160 #d9dfcf #e6eadd #82887a;
  box-shadow:
    0 0 0 0.35cqw var(--rim-light),
    0 0 0 0.6cqw var(--rim-dark);
}

.art-window {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  box-shadow: 0 0 0 0.25cqw #111;
}

.art {
  width: 100%;
  height: 100%;
  background: #000;
}

/* --- Type line ------------------------------------------------------------ */

.type-line {
  top: 78.4cqw;
  left: 10.5cqw;
  right: 9.6cqw;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: 'Crimson Pro', 'Times New Roman', serif;
  font-weight: 600;
  font-size: 4.4cqw;
}

/* Keyrune draws the common symbol flat black; old frames outlined it in white. */
.set-symbol {
  font-size: 4.2cqw;
  text-shadow: none;
  -webkit-text-stroke: 0.35cqw #fff;
  paint-order: stroke fill;
}

/* --- Text box ------------------------------------------------------------- */

.text-box {
  position: absolute;
  top: 83.1cqw;
  left: 9.95cqw;
  width: 80.4cqw;
  height: 40.6cqw;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1.1cqw solid var(--box-border);
  background: var(--box);
  box-shadow:
    0 0 0 0.3cqw var(--rim-dark),
    inset 0.4cqw 0.4cqw 0 #f4f7c4,
    inset -0.3cqw -0.3cqw 0 #3f7a2a;
}

.text-box .noise {
  opacity: 0.7;
}

.rules {
  position: relative;
  padding: 0 3cqw;
  font-family: 'Crimson Pro', 'Times New Roman', serif;
  font-size: 4.6cqw;
  line-height: 1.12;
  color: #111;
}

.rules p {
  margin: 0;
}

.rules p + p {
  margin-top: 1.2cqw;
}

.flavor {
  font-style: italic;
}

/* The colour's mana symbol, printed large with an olive drop shadow. */
.watermark {
  position: relative;
  font-size: 30cqw;
  line-height: 1;
  color: var(--symbol);
  text-shadow: 0.7cqw 0.7cqw 0 var(--symbol-shadow);
}

/* --- Artist and copyright ------------------------------------------------- */

.info {
  top: 125.6cqw;
  left: 0;
  right: 0;
  text-align: center;
  font-family: 'Crimson Pro', 'Times New Roman', serif;
}

.illus {
  font-weight: 600;
  font-size: 3.2cqw;
}

.copyright {
  margin-top: 0.9cqw;
  font-size: 1.9cqw;
}
</style>
