import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ProcessedImage, PaletteColor, ToolConfig, ToolMode, Region } from '../types';

interface ColoringCanvasProps {
    data: ProcessedImage;
    palette: PaletteColor[];
    activeColor: PaletteColor | null;
    config: ToolConfig;
    activeTool: ToolMode;
    filledRegions: Set<number>;
    onFillRegion: (id: number) => void;
    showOriginal: boolean;
    originalImageSrc: string | null;
    onToast: (msg: string, type: 'info' | 'error' | 'success') => void;
    // Controlled Props
    scale: number;
    offset: { x: number, y: number };
    onZoom: (scale: number) => void;
    onPan: (x: number, y: number) => void;
}

const PAINT_BUCKET_CURSOR = `url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj48cGF0aCBkPSJNMTIgMnYyMCBNMiAxMmgyMCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiIG9wYWNpdHk9IjAuOCIvPjxwYXRoIGQ9Ik0xMiAzdjE4IE0zIDEyaDE4IiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMi41IiBmaWxsPSJ3aGl0ZSIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEuNSIgZmlsbD0iI2VmNDQ0NCIvPjwvc3ZnPg==') 12 12, auto`;

// Animation types
interface Ripple {
    x: number;
    y: number;
    r: number;
    color: string;
    alpha: number;
    id: number;
}

const ColoringCanvas: React.FC<ColoringCanvasProps> = ({
    data,
    palette,
    activeColor,
    config,
    activeTool,
    filledRegions,
    onFillRegion,
    showOriginal,
    originalImageSrc,
    onToast,
    // New Props for Controlled State
    scale,
    offset,
    onZoom,
    onPan
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Performance Optimization: Offscreen Canvas Caches
    const baseLayerRef = useRef<HTMLCanvasElement | null>(null);
    const highlightLayerRef = useRef<HTMLCanvasElement | null>(null);

    // State Tracking for caching
    const lastFilledRegionsRef = useRef<Set<number>>(new Set());
    const lastShowBordersRef = useRef<boolean>(config.showBorders);

    // Keyboard Modifiers
    const [isSpaceHeld, setIsSpaceHeld] = useState(false);

    // Interaction State
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const offsetStartRef = useRef({ x: 0, y: 0 });

    // Animation State
    const [flashRegion, setFlashRegion] = useState<{ id: number, start: number } | null>(null);
    const ripplesRef = useRef<Ripple[]>([]);
    const animFrameRef = useRef<number>(0);

    // Hint State
    const [hintIndex, setHintIndex] = useState(0);

    // Viewport State (for resizing)
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    const effectiveTool = isSpaceHeld ? ToolMode.PAN : activeTool;

    // --- Phase 3: Spatial Indexing & Pre-computed Maps ---
    // Optimizes O(N) looups to O(1) or O(SpatialBucket)
    const { regionsById, spatialGrid, GRID_SIZE } = useMemo(() => {
        const idMap = new Map<number, Region>();
        data.regions.forEach(r => idMap.set(r.id, r));

        // Spatial Grid: 256px buckets
        const CELL_SIZE = 256;
        const gridWidth = Math.ceil(data.originalWidth / CELL_SIZE);
        const gridHeight = Math.ceil(data.originalHeight / CELL_SIZE);
        const grid: number[][] = new Array(gridWidth * gridHeight).fill(0).map(() => []);

        data.regions.forEach(r => {
            // Assign region to bucket based on centroid
            // Could assign to multiple if large, but centroid is usually enough for "numbers" culling
            // For drawing highlights, checking center is close enough for 99% cases
            const gx = Math.floor(r.centroid.x / CELL_SIZE);
            const gy = Math.floor(r.centroid.y / CELL_SIZE);
            if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight) {
                grid[gy * gridWidth + gx].push(r.id);
            }
        });

        return {
            regionsById: idMap,
            spatialGrid: grid,
            GRID_SIZE: CELL_SIZE
        };
    }, [data]);

    // --- Init & Resize Observer ---
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // --- Keyboard Listeners ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceHeld(true); };
        const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setIsSpaceHeld(false); };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useEffect(() => { setHintIndex(0); }, [activeColor]);

    // --- Base Layer Cache Management (Batched Delta Updates) ---
    useEffect(() => {
        const w = data.originalWidth;
        const h = data.originalHeight;

        if (!baseLayerRef.current) {
            baseLayerRef.current = document.createElement('canvas');
            baseLayerRef.current.width = w;
            baseLayerRef.current.height = h;
        } else if (baseLayerRef.current.width !== w || baseLayerRef.current.height !== h) {
            baseLayerRef.current.width = w;
            baseLayerRef.current.height = h;
            lastFilledRegionsRef.current = new Set();
        }

        const ctx = baseLayerRef.current.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const prevSize = lastFilledRegionsRef.current.size;
        const currSize = filledRegions.size;
        const bordersChanged = lastShowBordersRef.current !== config.showBorders;
        const isFullRedraw = lastFilledRegionsRef.current.size === 0 || currSize < prevSize || bordersChanged;

        if (isFullRedraw) {
            // Full Redraw Strategy: ImageData (Fastest for bulk)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);

            const imgData = ctx.getImageData(0, 0, w, h);
            const buf = new Uint32Array(imgData.data.buffer);
            const borderVal = (255 << 24) | (219 << 16) | (213 << 8) | 209; // #d1d5db

            if (config.showBorders) {
                for (let i = 0; i < data.regions.length; i++) {
                    const region = data.regions[i];
                    if (!filledRegions.has(region.id)) {
                        for (let j = 0; j < region.borderPixels.length; j++) buf[region.borderPixels[j]] = borderVal;
                    }
                }
            }

            filledRegions.forEach(rId => {
                const region = regionsById.get(rId);
                if (region) {
                    const c = palette[region.colorId].rgb;
                    const colorVal = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
                    for (let j = 0; j < region.pixels.length; j++) buf[region.pixels[j]] = colorVal;
                }
            });
            ctx.putImageData(imgData, 0, 0);

        } else {
            // Delta Update Strategy: Batched Path (Fastest for sparse)
            const newRegions: number[] = [];
            filledRegions.forEach(rId => {
                if (!lastFilledRegionsRef.current.has(rId)) newRegions.push(rId);
            });

            // Optimize: Group by color to minimize style changes
            const updatesByColor = new Map<number, number[]>();
            newRegions.forEach(rId => {
                const r = regionsById.get(rId);
                if (r) {
                    if (!updatesByColor.has(r.colorId)) updatesByColor.set(r.colorId, []);
                    updatesByColor.get(r.colorId)!.push(rId);
                }
            });

            updatesByColor.forEach((rIds, colorId) => {
                const c = palette[colorId].rgb;
                ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
                ctx.beginPath();
                for (const rId of rIds) {
                    const region = regionsById.get(rId);
                    if (region) {
                        for (const pIdx of region.pixels) {
                            ctx.rect(pIdx % w, Math.floor(pIdx / w), 1, 1);
                        }
                    }
                }
                ctx.fill();
            });
        }

        lastFilledRegionsRef.current = new Set(filledRegions);
        lastShowBordersRef.current = config.showBorders;

    }, [filledRegions, data, palette, config.showBorders, regionsById]);

    // --- Highlight Layer Cache ---
    useEffect(() => {
        const w = data.originalWidth;
        const h = data.originalHeight;

        if (!highlightLayerRef.current) {
            highlightLayerRef.current = document.createElement('canvas');
            highlightLayerRef.current.width = w;
            highlightLayerRef.current.height = h;
        } else if (highlightLayerRef.current.width !== w || highlightLayerRef.current.height !== h) {
            highlightLayerRef.current.width = w;
            highlightLayerRef.current.height = h;
        }

        const ctx = highlightLayerRef.current.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, w, h);

        if (config.highlightActive && activeColor) {
            ctx.fillStyle = activeColor.hex + '66';
            ctx.beginPath();

            for (let i = 0; i < data.regions.length; i++) {
                const region = data.regions[i];
                if (!filledRegions.has(region.id) && region.colorId === activeColor.id - 1) {
                    for (const pIdx of region.pixels) {
                        ctx.rect(pIdx % w, Math.floor(pIdx / w), 1, 1);
                    }
                }
            }
            ctx.fill();
        }
    }, [activeColor, config.highlightActive, filledRegions, data]);

    // --- Main Render Loop (Spatial Culling) ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const vW = canvas.width;
        const vH = canvas.height;
        ctx.clearRect(0, 0, vW, vH);

        // 1. Calculate Source Rect
        const sX = -offset.x / scale;
        const sY = -offset.y / scale;
        const sW = vW / scale;
        const sH = vH / scale;

        // 2. Draw Cached Layers
        if (baseLayerRef.current) ctx.drawImage(baseLayerRef.current, sX, sY, sW, sH, 0, 0, vW, vH);
        if (highlightLayerRef.current && config.highlightActive && activeColor) {
            ctx.drawImage(highlightLayerRef.current, sX, sY, sW, sH, 0, 0, vW, vH);
        }

        // 3. Dynamic Elements (Flash, Ripples)
        if (flashRegion) {
            const now = performance.now();
            const diff = now - flashRegion.start;
            if (diff < 400) {
                const alpha = Math.max(0, 1 - diff / 400);
                // O(1) Lookup
                const region = regionsById.get(flashRegion.id);
                if (region) {
                    ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
                    ctx.beginPath();
                    for (const pIdx of region.pixels) {
                        const rX = pIdx % data.originalWidth;
                        const rY = Math.floor(pIdx / data.originalWidth);
                        const dX = rX * scale + offset.x;
                        const dY = rY * scale + offset.y;
                        if (dX >= -scale && dX <= vW && dY >= -scale && dY <= vH) {
                            ctx.rect(dX, dY, Math.ceil(scale), Math.ceil(scale));
                        }
                    }
                    ctx.fill();
                }
            } else {
                setFlashRegion(null);
            }
        }

        if (ripplesRef.current.length > 0) {
            ripplesRef.current.forEach((ripple) => {
                const dX = ripple.x * scale + offset.x;
                const dY = ripple.y * scale + offset.y;
                const dR = ripple.r * scale;
                ctx.beginPath();
                ctx.arc(dX, dY, dR, 0, Math.PI * 2);
                ctx.fillStyle = ripple.color;
                ctx.globalAlpha = ripple.alpha;
                ctx.fill();
                ctx.globalAlpha = 1.0;
                ripple.r += 2 / scale;
                ripple.alpha -= 0.05;
            });
            ripplesRef.current = ripplesRef.current.filter(r => r.alpha > 0);
        }

        // 4. Numbers (Spatial Culling)
        if (config.showNumbers) {
            const fontSize = Math.max(12, Math.floor(data.originalWidth / 120));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Calculate which grid cells are visible
            const startGx = Math.floor(sX / GRID_SIZE);
            const startGy = Math.floor(sY / GRID_SIZE);
            const endGx = Math.floor((sX + sW) / GRID_SIZE);
            const endGy = Math.floor((sY + sH) / GRID_SIZE);

            const gridWidth = Math.ceil(data.originalWidth / GRID_SIZE);

            // Iterate only visible buckets
            for (let gy = startGy; gy <= endGy; gy++) {
                for (let gx = startGx; gx <= endGx; gx++) {
                    const idx = gy * gridWidth + gx;
                    // Check bounds for grid index
                    if (idx >= 0 && idx < spatialGrid.length && spatialGrid[idx]) {
                        for (const rId of spatialGrid[idx]) {
                            const region = regionsById.get(rId)!;

                            // Re-verify exact bounds (bucket is coarse)
                            // Strict culling logic: region MUST have centroid inside viewport?
                            // Or overlaps? Numbers are drawn at centroid. So checking centroid is correct.
                            if (region.centroid.x < sX || region.centroid.x > sX + sW ||
                                region.centroid.y < sY || region.centroid.y > sY + sH) continue;

                            const isFilled = filledRegions.has(region.id);
                            const screenX = region.centroid.x * scale + offset.x;
                            const screenY = region.centroid.y * scale + offset.y;

                            if (!isFilled) {
                                const approxSize = Math.sqrt(region.pixels.length) * scale;
                                if (approxSize > 12) {
                                    const isActive = activeColor && (region.colorId === activeColor.id - 1);
                                    if (isActive) {
                                        ctx.fillStyle = '#000000';
                                        ctx.font = `bold ${Math.min(40, fontSize * scale)}px sans-serif`;
                                    } else {
                                        ctx.fillStyle = '#9ca3af';
                                        ctx.font = `bold ${Math.min(30, fontSize * scale)}px sans-serif`;
                                    }
                                    ctx.fillText(palette[region.colorId].id.toString(), screenX, screenY);
                                }
                            } else {
                                const approxSize = Math.sqrt(region.pixels.length) * scale;
                                if (approxSize > 40 && scale > 2) {
                                    ctx.fillStyle = palette[region.colorId].textColor;
                                    ctx.globalAlpha = 0.5;
                                    ctx.font = `bold ${Math.min(30, fontSize * scale)}px sans-serif`;
                                    ctx.fillText(palette[region.colorId].id.toString(), screenX, screenY);
                                    ctx.globalAlpha = 1.0;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (ripplesRef.current.length > 0 || flashRegion) {
            animFrameRef.current = requestAnimationFrame(draw);
        }

    }, [data, palette, filledRegions, config, scale, offset, flashRegion, activeColor, viewportSize, spatialGrid, regionsById, GRID_SIZE]);

    useEffect(() => { draw(); return () => cancelAnimationFrame(animFrameRef.current); }, [draw]);

    const useHint = () => {
        if (!activeColor) return;
        const candidates = data.regions.filter(r => r.colorId === activeColor.id - 1 && !filledRegions.has(r.id));
        candidates.sort((a, b) => a.pixels.length - b.pixels.length);

        if (candidates.length === 0) {
            onToast("This color is complete!", 'success');
            return;
        }
        const target = candidates[hintIndex % candidates.length];
        setHintIndex(prev => prev + 1);

        if (containerRef.current) {
            const { clientWidth, clientHeight } = containerRef.current;
            const newScale = Math.min(6, 250 / Math.sqrt(target.pixels.length));
            const newOffsetX = (clientWidth / 2) - (target.centroid.x * newScale);
            const newOffsetY = (clientHeight / 2) - (target.centroid.y * newScale);
            onZoom(newScale);
            onPan(newOffsetX, newOffsetY);
            setFlashRegion({ id: target.id, start: performance.now() });
        }
    };

    const performFill = (clientX: number, clientY: number) => {
        if (showOriginal) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const viewX = clientX - rect.left;
        const viewY = clientY - rect.top;
        const x = Math.floor((viewX - offset.x) / scale);
        const y = Math.floor((viewY - offset.y) / scale);

        if (x < 0 || x >= data.originalWidth || y < 0 || y >= data.originalHeight) return;

        const pIdx = y * data.originalWidth + x;
        const regionId = data.regionMap[pIdx];

        if (regionId >= 0 && activeColor) {
            const region = regionsById.get(regionId);
            if (region) {
                const isMatch = activeColor.id - 1 === region.colorId;
                const isAlreadyFilled = filledRegions.has(regionId);
                if (isMatch && !isAlreadyFilled) {
                    onFillRegion(regionId);
                    ripplesRef.current.push({ x: x, y: y, r: 5, color: activeColor.hex, alpha: 1.0, id: Date.now() });
                } else if (!isMatch && !isAlreadyFilled) {
                    setFlashRegion({ id: regionId, start: performance.now() });
                } else if (isMatch && isAlreadyFilled) {
                    onFillRegion(regionId);
                    ripplesRef.current.push({ x: x, y: y, r: 5, color: activeColor.hex, alpha: 1.0, id: Date.now() });
                }
            }
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        if (effectiveTool === ToolMode.PAN) {
            isDraggingRef.current = true;
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            offsetStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        } else performFill(e.clientX, e.clientY);
    };

    const clampOffset = (targetX: number, targetY: number) => {
        const BUFFER = 100;
        const vW = viewportSize.width;
        const vH = viewportSize.height;
        const imgW = data.originalWidth * scale;
        const imgH = data.originalHeight * scale;

        // Ensure at least BUFFER pixels are visible
        const minX = BUFFER - imgW;
        const maxX = vW - BUFFER;
        const minY = BUFFER - imgH;
        const maxY = vH - BUFFER;

        return {
            x: Math.max(minX, Math.min(maxX, targetX)),
            y: Math.max(minY, Math.min(maxY, targetY))
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDraggingRef.current && effectiveTool === ToolMode.PAN) {
            const rawX = e.clientX - offsetStartRef.current.x;
            const rawY = e.clientY - offsetStartRef.current.y;
            const clamped = clampOffset(rawX, rawY);
            onPan(clamped.x, clamped.y);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        isDraggingRef.current = false;
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        onZoom(Math.max(0.05, Math.min(10, scale - e.deltaY * 0.001)));
    };

    const touchStartDistRef = useRef<number>(0);
    const lastTouchRef = useRef<{ x: number, y: number } | null>(null);

    const getTouchDistance = (t1: React.Touch, t2: React.Touch) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            touchStartDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
            offsetStartRef.current = { ...offset };
        } else if (e.touches.length === 1) {
            lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (effectiveTool === ToolMode.PAN) {
                isDraggingRef.current = true;
                offsetStartRef.current = { x: offset.x, y: offset.y };
                dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = getTouchDistance(e.touches[0], e.touches[1]);
            onZoom(Math.max(0.1, Math.min(10, scale * (dist / touchStartDistRef.current))));
            touchStartDistRef.current = dist;
            e.preventDefault();
        } else if (e.touches.length === 1 && isDraggingRef.current) {
            const t = e.touches[0];
            // Calculate absolute difference from start
            const deltaX = t.clientX - dragStartRef.current.x;
            const deltaY = t.clientY - dragStartRef.current.y;

            // Apply to INITIAL offset
            const rawX = offsetStartRef.current.x + deltaX;
            const rawY = offsetStartRef.current.y + deltaY;

            const clamped = clampOffset(rawX, rawY);
            onPan(clamped.x, clamped.y);

            e.preventDefault(); // Prevent scrolling while panning
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (e.changedTouches.length === 1 && e.touches.length === 0) {
            const start = dragStartRef.current;
            const end = e.changedTouches[0];
            const dist = Math.hypot(end.clientX - start.x, end.clientY - start.y);
            if (dist < 10) performFill(end.clientX, end.clientY);
        }
        isDraggingRef.current = false;
    };

    const getCursor = () => effectiveTool === ToolMode.PAN ? (isDraggingRef.current ? 'grabbing' : 'grab') : PAINT_BUCKET_CURSOR;

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden bg-gray-800 touch-none checkerboard"
            style={{ cursor: getCursor() }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <canvas
                ref={canvasRef}
                width={viewportSize.width}
                height={viewportSize.height}
                className="absolute top-0 left-0 rendering-pixelated shadow-2xl transition-opacity duration-200"
                style={{ imageRendering: 'auto' }}
            />
            {originalImageSrc && (
                <img
                    src={originalImageSrc}
                    alt="Original"
                    className={`absolute origin-top-left pointer-events-none transition-opacity duration-200 shadow-2xl ${showOriginal ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                        width: data.originalWidth,
                        height: data.originalHeight,
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        maxWidth: 'none',
                        maxHeight: 'none'
                    }}
                />
            )}
            <div
                className="absolute bottom-6 left-6 pointer-events-auto flex gap-2"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <button
                    onClick={useHint}
                    className="flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full shadow-lg shadow-indigo-500/30 transition-transform active:scale-95"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    Find Next
                </button>
            </div>
        </div>
    );
};

export default ColoringCanvas;
