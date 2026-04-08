export type AtlasRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CapeTemplate = {
  front: AtlasRegion;
  back: AtlasRegion;
  left: AtlasRegion;
  right: AtlasRegion;
  top: AtlasRegion;
  bottom: AtlasRegion;
  elytra: {
    front: AtlasRegion;
    back: AtlasRegion;
    left: AtlasRegion;
    right: AtlasRegion;
    top: AtlasRegion;
    bottom: AtlasRegion;
  };
};

type UvPoint = {
  x: number;
  y: number;
};

export const MINECRAFT_CAPE_TEXTURE_WIDTH = 64;
export const MINECRAFT_CAPE_TEXTURE_HEIGHT = 64;
export const MINECRAFT_CAPE_TEXTURE_LEGACY_HEIGHT = 32;
export const MINECRAFT_CAPE_BOX_WIDTH = 10;
export const MINECRAFT_CAPE_BOX_HEIGHT = 16;
export const MINECRAFT_CAPE_BOX_DEPTH = 1;
export const MINECRAFT_ELYTRA_BOX_WIDTH = 10;
export const MINECRAFT_ELYTRA_BOX_HEIGHT = 20;
export const MINECRAFT_ELYTRA_BOX_DEPTH = 2;

function toFaceVertices(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  textureWidth: number,
  textureHeight: number
): [UvPoint, UvPoint, UvPoint, UvPoint] {
  return [
    { x: x1 / textureWidth, y: 1 - y2 / textureHeight },
    { x: x2 / textureWidth, y: 1 - y2 / textureHeight },
    { x: x2 / textureWidth, y: 1 - y1 / textureHeight },
    { x: x1 / textureWidth, y: 1 - y1 / textureHeight }
  ];
}

export function resolveMinecraftCapeTemplate(textureWidth: number, textureHeight: number): CapeTemplate {
  const legacyAtlas = textureWidth === textureHeight * 2;
  const textureBaseHeight = legacyAtlas ? MINECRAFT_CAPE_TEXTURE_LEGACY_HEIGHT : MINECRAFT_CAPE_TEXTURE_HEIGHT;
  const unitX = textureWidth / MINECRAFT_CAPE_TEXTURE_WIDTH;
  const unitY = textureHeight / textureBaseHeight;
  const width = MINECRAFT_CAPE_BOX_WIDTH * unitX;
  const height = MINECRAFT_CAPE_BOX_HEIGHT * unitY;
  const depthX = MINECRAFT_CAPE_BOX_DEPTH * unitX;
  const depthY = MINECRAFT_CAPE_BOX_DEPTH * unitY;
  const elytraWidth = MINECRAFT_ELYTRA_BOX_WIDTH * unitX;
  const elytraHeight = MINECRAFT_ELYTRA_BOX_HEIGHT * unitY;
  const elytraDepthX = MINECRAFT_ELYTRA_BOX_DEPTH * unitX;
  const elytraDepthY = MINECRAFT_ELYTRA_BOX_DEPTH * unitY;
  const elytraStartX = (MINECRAFT_CAPE_BOX_DEPTH + MINECRAFT_CAPE_BOX_WIDTH + MINECRAFT_CAPE_BOX_WIDTH + MINECRAFT_CAPE_BOX_DEPTH) * unitX;

  return {
    top: { x: depthX, y: 0, width, height: depthY },
    bottom: { x: width + depthX, y: 0, width, height: depthY },
    left: { x: 0, y: depthY, width: depthX, height },
    front: { x: depthX, y: depthY, width, height },
    right: { x: width + depthX, y: depthY, width: depthX, height },
    back: { x: width + depthX * 2, y: depthY, width, height },
    elytra: {
      top: { x: elytraStartX + elytraDepthX, y: 0, width: elytraWidth, height: elytraDepthY },
      bottom: { x: elytraStartX + elytraDepthX + elytraWidth, y: 0, width: elytraWidth, height: elytraDepthY },
      left: { x: elytraStartX, y: elytraDepthY, width: elytraDepthX, height: elytraHeight },
      front: { x: elytraStartX + elytraDepthX, y: elytraDepthY, width: elytraWidth, height: elytraHeight },
      right: { x: elytraStartX + elytraDepthX + elytraWidth, y: elytraDepthY, width: elytraDepthX, height: elytraHeight },
      back: { x: elytraStartX + elytraDepthX * 2 + elytraWidth, y: elytraDepthY, width: elytraWidth, height: elytraHeight }
    }
  };
}

export function buildMinecraftCapeUvData(textureWidth: number, textureHeight: number): Float32Array {
  const template = resolveMinecraftCapeTemplate(textureWidth, textureHeight);

  const top = toFaceVertices(
    template.top.x,
    template.top.y,
    template.top.x + template.top.width,
    template.top.y + template.top.height,
    textureWidth,
    textureHeight
  );
  const bottom = toFaceVertices(
    template.bottom.x,
    template.bottom.y,
    template.bottom.x + template.bottom.width,
    template.bottom.y + template.bottom.height,
    textureWidth,
    textureHeight
  );
  const left = toFaceVertices(
    template.left.x,
    template.left.y,
    template.left.x + template.left.width,
    template.left.y + template.left.height,
    textureWidth,
    textureHeight
  );
  const front = toFaceVertices(
    template.front.x,
    template.front.y,
    template.front.x + template.front.width,
    template.front.y + template.front.height,
    textureWidth,
    textureHeight
  );
  const right = toFaceVertices(
    template.right.x,
    template.right.y,
    template.right.x + template.right.width,
    template.right.y + template.right.height,
    textureWidth,
    textureHeight
  );
  const back = toFaceVertices(
    template.back.x,
    template.back.y,
    template.back.x + template.back.width,
    template.back.y + template.back.height,
    textureWidth,
    textureHeight
  );

  const uvFaces = [
    [right[3], right[2], right[0], right[1]],
    [left[3], left[2], left[0], left[1]],
    [top[3], top[2], top[0], top[1]],
    [bottom[0], bottom[1], bottom[3], bottom[2]],
    [front[3], front[2], front[0], front[1]],
    [back[3], back[2], back[0], back[1]]
  ];

  const data: number[] = [];
  for (const face of uvFaces) {
    for (const uv of face) {
      data.push(uv.x, uv.y);
    }
  }

  return new Float32Array(data);
}
