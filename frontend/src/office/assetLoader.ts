import {
  CHAR_COUNT,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
  PNG_ALPHA_THRESHOLD,
  WALL_BITMASK_COUNT,
  WALL_GRID_COLS,
  WALL_PIECE_HEIGHT,
  WALL_PIECE_WIDTH,
} from './constants.js';
import type { SpriteData, OfficeLayout } from './types.js';

export interface CharacterDirectionSprites {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
}

export interface LoadedAssets {
  characters: CharacterDirectionSprites[];
  floors: SpriteData[];
  walls: SpriteData[][];
  furnitureCatalog: any[];
  furnitureSprites: Map<string, SpriteData>;
  defaultLayout: OfficeLayout;
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  if (a < PNG_ALPHA_THRESHOLD) return '';
  const hex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  const rgb = `#${hex(r)}${hex(g)}${hex(b)}`;
  if (a >= 255) return rgb;
  return `${rgb}${hex(a)}`;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function getImageData(img: HTMLImageElement): { data: Uint8ClampedArray; width: number; height: number } {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

export async function loadCharacterSprites(): Promise<CharacterDirectionSprites[]> {
  const characters: CharacterDirectionSprites[] = [];
  for (let i = 0; i < CHAR_COUNT; i++) {
    const img = await loadImage(`/assets/characters/char_${i}.png`);
    const { data, width } = getImageData(img);
    const charData: CharacterDirectionSprites = { down: [], up: [], right: [] };
    const directions = ['down', 'up', 'right'] as const;

    for (let d = 0; d < directions.length; d++) {
      const dir = directions[d];
      const rowY = d * CHAR_FRAME_H;
      for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
        const sprite: SpriteData = [];
        const colX = f * CHAR_FRAME_W;
        for (let y = 0; y < CHAR_FRAME_H; y++) {
          const row: string[] = [];
          for (let x = 0; x < CHAR_FRAME_W; x++) {
            const idx = ((rowY + y) * width + (colX + x)) * 4;
            row.push(rgbaToHex(data[idx], data[idx + 1], data[idx + 2], data[idx + 3]));
          }
          sprite.push(row);
        }
        charData[dir].push(sprite);
      }
    }
    characters.push(charData);
  }
  return characters;
}

export async function loadFloorTiles(): Promise<SpriteData[]> {
  const floors: SpriteData[] = [];
  // Normally there are multiple floors, but let's check how many to load.
  // In pixel-agents-main assetLoader.ts, it scans the directory.
  // For the web version, we can try to guess or use a fixed list.
  // There are floor_0.png, floor_1.png...
  for (let i = 0; i < 9; i++) { // Assuming 9 floors based on TileType
    try {
      const img = await loadImage(`/assets/floors/floor_${i}.png`);
      const { data, width, height } = getImageData(img);
      const sprite: SpriteData = [];
      for (let y = 0; y < height; y++) {
        const row: string[] = [];
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          row.push(rgbaToHex(data[idx], data[idx + 1], data[idx + 2], data[idx + 3]));
        }
        sprite.push(row);
      }
      floors.push(sprite);
    } catch (e) {
      break;
    }
  }
  return floors;
}

export async function loadWallTiles(): Promise<SpriteData[][]> {
  const wallSets: SpriteData[][] = [];
  for (let i = 0; i < 4; i++) { // Assuming up to 4 wall sets
    try {
      const img = await loadImage(`/assets/walls/wall_${i}.png`);
      const { data, width } = getImageData(img);
      const set: SpriteData[] = [];
      for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
        const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH;
        const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT;
        const sprite: SpriteData = [];
        for (let y = 0; y < WALL_PIECE_HEIGHT; y++) {
          const row: string[] = [];
          for (let x = 0; x < WALL_PIECE_WIDTH; x++) {
            const idx = ((oy + y) * width + (ox + x)) * 4;
            row.push(rgbaToHex(data[idx], data[idx + 1], data[idx + 2], data[idx + 3]));
          }
          sprite.push(row);
        }
        set.push(sprite);
      }
      wallSets.push(set);
    } catch (e) {
      break;
    }
  }
  return wallSets;
}

export async function loadFurnitureAssets(): Promise<{ catalog: any[], sprites: Map<string, SpriteData> }> {
  const response = await fetch('/assets/furniture-catalog.json');
  const catalog = await response.json();
  const sprites = new Map<string, SpriteData>();

  // Fetch all furniture PNGs
  // The catalog has absolute relative paths or we can assume they are in /assets/furniture/folder/file.png
  // Actually, pixel-agents loads them directory by directory.
  // In the webversion we might need a manifest or just load them from the catalog.
  // Let's see what catalog entry looks like.
  for (const entry of catalog) {
    if (!entry.id) continue;
    try {
        // The catalog we copied might already have some info, but usually it doesn't have SpriteData.
        // We need to load the PNG file.
        // Based on backend logic: assetPath = path.join(itemDir, asset.file);
        // We'll need to know which folder each asset belongs to.
        // But for now, let's assume they are all in /assets/furniture/{id}.png or similar.
        // Wait, the catalog produced by flattenManifest contains the 'file' property.
        // But it doesn't contain the folder.
        // Let's check a sample from furniture-catalog.json later if this fails.
        const folder = entry.groupId || entry.id;
        const url = `/assets/furniture/${folder}/${entry.file || (entry.id + '.png')}`;
        const img = await loadImage(url);
        const { data, width, height } = getImageData(img);
        const sprite: SpriteData = [];
        for (let y = 0; y < height; y++) {
          const row: string[] = [];
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            row.push(rgbaToHex(data[idx], data[idx + 1], data[idx + 2], data[idx + 3]));
          }
          sprite.push(row);
        }
        sprites.set(entry.id, sprite);
    } catch (e) {
      console.warn(`Failed to load furniture sprite for ${entry.id}`, e);
    }
  }
  return { catalog, sprites };
}

export async function loadDefaultLayout(): Promise<OfficeLayout> {
  const response = await fetch('/assets/default-layout-1.json');
  return await response.json();
}

export async function loadAllAssets(): Promise<LoadedAssets> {
  const [characters, floors, walls, furniture, defaultLayout] = await Promise.all([
    loadCharacterSprites(),
    loadFloorTiles(),
    loadWallTiles(),
    loadFurnitureAssets(),
    loadDefaultLayout(),
  ]);

  return {
    characters,
    floors,
    walls,
    furnitureCatalog: furniture.catalog,
    furnitureSprites: furniture.sprites,
    defaultLayout,
  };
}
