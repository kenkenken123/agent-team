import {
  MATRIX_COLUMN_STAGGER_RANGE,
  MATRIX_FLICKER_FPS,
  MATRIX_FLICKER_VISIBILITY_THRESHOLD,
  MATRIX_HEAD_COLOR,
  MATRIX_SPRITE_COLS,
  MATRIX_SPRITE_ROWS,
  MATRIX_TRAIL_DIM_THRESHOLD,
  MATRIX_TRAIL_EMPTY_ALPHA,
  MATRIX_TRAIL_LENGTH,
  MATRIX_TRAIL_MID_THRESHOLD,
  MATRIX_TRAIL_OVERLAY_ALPHA,
} from '../constants.js';
import type { Character, SpriteData } from '../types.js';
import { MATRIX_EFFECT_DURATION } from '../types.js';

/** Hash-based flicker: ~70% visible for shimmer effect */
function flickerVisible(col: number, row: number, time: number): boolean {
  const t = Math.floor(time * MATRIX_FLICKER_FPS);
  const hash = (col * 7 + row * 13 + t * 31) & 0xff;
  return hash < MATRIX_FLICKER_VISIBILITY_THRESHOLD;
}

function generateSeeds(): number[] {
  const seeds: number[] = [];
  for (let i = 0; i < MATRIX_SPRITE_COLS; i++) {
    seeds.push(Math.random());
  }
  return seeds;
}

export { generateSeeds as matrixEffectSeeds };

// ─── 优化：离屏 Canvas 缓存矩阵特效帧 ─────────────────────────────────────

/** 缓存键格式: "palette-seedsHash-spawn/despawn-progressStep" */
interface MatrixCacheKey {
  spriteHash: string;
  isSpawn: boolean;
  progressStep: number;
}

/** 离屏 Canvas 缓存 */
const matrixCache = new Map<string, HTMLCanvasElement>();

/** 将进度离散化为步长，减少缓存条目 */
const MATRIX_PROGRESS_STEPS = 15;

/** 计算 sprite 数据的简单哈希 */
function hashSpriteData(spriteData: SpriteData): string {
  let hash = 0;
  for (let r = 0; r < spriteData.length; r++) {
    for (let c = 0; c < spriteData[r].length; c++) {
      const pixel = spriteData[r][c];
      if (pixel && pixel !== '') {
        hash = ((hash << 5) - hash + pixel.charCodeAt(0)) | 0;
      }
    }
  }
  return hash.toString(36);
}

/** 生成缓存键 */
function makeCacheKey(key: MatrixCacheKey): string {
  return `${key.spriteHash}-${key.isSpawn ? 's' : 'd'}-${key.progressStep}`;
}

/** 预渲染矩阵特效帧到离屏 Canvas */
function renderMatrixFrameToCanvas(
  spriteData: SpriteData,
  progress: number,
  isSpawn: boolean,
  time: number,
  seeds: number[],
): HTMLCanvasElement {
  const zoom = 1; // 在 1x 分辨率下渲染，运行时缩放
  const width = MATRIX_SPRITE_COLS * zoom;
  const height = MATRIX_SPRITE_ROWS * zoom;

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const totalSweep = MATRIX_SPRITE_ROWS + MATRIX_TRAIL_LENGTH;

  for (let col = 0; col < MATRIX_SPRITE_COLS; col++) {
    const stagger = (seeds[col] ?? 0) * MATRIX_COLUMN_STAGGER_RANGE;
    const colProgress = Math.max(
      0,
      Math.min(1, (progress - stagger) / (1 - MATRIX_COLUMN_STAGGER_RANGE)),
    );
    const headRow = colProgress * totalSweep;

    for (let row = 0; row < MATRIX_SPRITE_ROWS; row++) {
      const pixel = spriteData[row]?.[col];
      const hasPixel = pixel && pixel !== '';
      const distFromHead = headRow - row;
      const px = col * zoom;
      const py = row * zoom;

      if (isSpawn) {
        if (distFromHead < 0) {
          continue;
        } else if (distFromHead < 1) {
          ctx.fillStyle = MATRIX_HEAD_COLOR;
          ctx.fillRect(px, py, zoom, zoom);
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          const trailPos = distFromHead / MATRIX_TRAIL_LENGTH;
          if (hasPixel) {
            ctx.fillStyle = pixel;
            ctx.fillRect(px, py, zoom, zoom);
            const greenAlpha = (1 - trailPos) * MATRIX_TRAIL_OVERLAY_ALPHA;
            if (flickerVisible(col, row, time)) {
              ctx.fillStyle = `rgba(0, 255, 65, ${greenAlpha})`;
              ctx.fillRect(px, py, zoom, zoom);
            }
          } else {
            if (flickerVisible(col, row, time)) {
              const alpha = (1 - trailPos) * MATRIX_TRAIL_EMPTY_ALPHA;
              ctx.fillStyle =
                trailPos < MATRIX_TRAIL_MID_THRESHOLD
                  ? `rgba(0, 255, 65, ${alpha})`
                  : trailPos < MATRIX_TRAIL_DIM_THRESHOLD
                    ? `rgba(0, 170, 40, ${alpha})`
                    : `rgba(0, 85, 20, ${alpha})`;
              ctx.fillRect(px, py, zoom, zoom);
            }
          }
        } else {
          if (hasPixel) {
            ctx.fillStyle = pixel;
            ctx.fillRect(px, py, zoom, zoom);
          }
        }
      } else {
        if (distFromHead < 0) {
          if (hasPixel) {
            ctx.fillStyle = pixel;
            ctx.fillRect(px, py, zoom, zoom);
          }
        } else if (distFromHead < 1) {
          ctx.fillStyle = MATRIX_HEAD_COLOR;
          ctx.fillRect(px, py, zoom, zoom);
        } else if (distFromHead < MATRIX_TRAIL_LENGTH) {
          if (flickerVisible(col, row, time)) {
            const trailPos = distFromHead / MATRIX_TRAIL_LENGTH;
            const alpha = (1 - trailPos) * MATRIX_TRAIL_EMPTY_ALPHA;
            ctx.fillStyle =
              trailPos < MATRIX_TRAIL_MID_THRESHOLD
                ? `rgba(0, 255, 65, ${alpha})`
                : trailPos < MATRIX_TRAIL_DIM_THRESHOLD
                  ? `rgba(0, 170, 40, ${alpha})`
                  : `rgba(0, 85, 20, ${alpha})`;
            ctx.fillRect(px, py, zoom, zoom);
          }
        }
      }
    }
  }

  return offscreen;
}

/**
 * 获取或创建缓存的矩阵特效帧
 * 优化：使用离散化进度减少缓存条目，避免每帧重新计算
 */
function getCachedMatrixFrame(
  spriteData: SpriteData,
  progress: number,
  isSpawn: boolean,
  time: number,
  seeds: number[],
): HTMLCanvasElement {
  // 离散化进度
  const progressStep = Math.round(progress * MATRIX_PROGRESS_STEPS);
  const spriteHash = hashSpriteData(spriteData);
  const key = makeCacheKey({ spriteHash, isSpawn, progressStep });

  let cached = matrixCache.get(key);
  if (!cached) {
    const actualProgress = progressStep / MATRIX_PROGRESS_STEPS;
    cached = renderMatrixFrameToCanvas(spriteData, actualProgress, isSpawn, time, seeds);
    matrixCache.set(key, cached);

    // 限制缓存大小，防止内存泄漏
    if (matrixCache.size > 500) {
      // 删除最旧的条目
      const firstKey = matrixCache.keys().next().value;
      if (firstKey) matrixCache.delete(firstKey);
    }
  }

  return cached;
}

/** 清理矩阵特效缓存（在角色完成特效后调用） */
export function clearMatrixCacheForSprite(spriteHash: string): void {
  for (const key of matrixCache.keys()) {
    if (key.startsWith(`${spriteHash}-`)) {
      matrixCache.delete(key);
    }
  }
}

/**
 * 渲染矩阵特效（优化版）
 * 使用离屏 Canvas 缓存预渲染帧，减少运行时计算
 */
export function renderMatrixEffect(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  spriteData: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  const progress = ch.matrixEffectTimer / MATRIX_EFFECT_DURATION;
  const isSpawn = ch.matrixEffect === 'spawn';
  const time = ch.matrixEffectTimer;

  // 获取缓存的特效帧
  const cachedFrame = getCachedMatrixFrame(
    spriteData,
    progress,
    isSpawn,
    time,
    ch.matrixEffectSeeds,
  );

  // 绘制缩放后的缓存帧
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    cachedFrame,
    drawX,
    drawY,
    cachedFrame.width * zoom,
    cachedFrame.height * zoom,
  );
  ctx.restore();
}
