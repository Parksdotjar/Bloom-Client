export type AnimatedCapeManifestFrame = {
  index: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
};

export type AnimatedCapeManifestAtlasPage = {
  path: string;
  width: number;
  height: number;
};

export type AnimatedCapeManifest = {
  version: 1;
  cosmeticType: 'cape';
  atlasPages: AnimatedCapeManifestAtlasPage[];
  frameWidth: number;
  frameHeight: number;
  fps: number;
  durationSeconds: number;
  frameCount: number;
  loopMode: 'repeat' | 'once';
  frames: AnimatedCapeManifestFrame[];
};
