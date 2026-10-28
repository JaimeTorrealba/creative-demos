// main.js is the plain-JS Three.js port, carried over unchanged; this types its one entry point
// for the TypeScript side.
export interface HairMeshDemo {
  dispose: () => void
}

export declare const createHairMeshDemo: (container: HTMLElement) => HairMeshDemo
