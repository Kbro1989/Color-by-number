import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ProcessedImage, PaletteColor, ToolConfig, ToolMode } from '../types';

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

const PAINT_BUCKET_CURSOR = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.4));"><path d="M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11z"/><path d="M5 2l5 5"/><path d="M2 13l2.6-2.6"/><path d="M22 13a3 3 0 0 0-3 3 7 7 0 0 1-7 7"/></svg>') 0 22, auto`;

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

    // Performance Optimization: Offscreen Canvas Cache
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const lastFilledRegionsRef = useRef<Set<number>>(new Set());

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

    // Determine Effective Tool (Spacebar overrides)
    const effectiveTool = isSpaceHeld ? ToolMode.PAN : activeTool;

    // Keyboard Listeners
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

    // Reset hint index when active color changes
    useEffect(() => {
        setHintIndex(0);
    }, [activeColor]);

    // --- Cache Initialization & Update ---
    useEffect(() => {
        // Init Offscreen Canvas
        if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement('canvas');
            offscreenCanvasRef.current.width = data.originalWidth;
            offscreenCanvasRef.current.height = data.originalHeight;
        } else if (offscreenCanvasRef.current.width !== data.originalWidth || offscreenCanvasRef.current.height !== data.originalHeight) {
            offscreenCanvasRef.current.width = data.originalWidth;
            offscreenCanvasRef.current.height = data.originalHeight;
            lastFilledRegionsRef.current = new Set(); // Reset cache tracker if size changes
        }

        const ctx = offscreenCanvasRef.current.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const w = data.originalWidth;
        const h = data.originalHeight;

        // If this is a fresh init or full reset (e.g. undo all used to be empty, now filledRegions size is 0 but last was > 0)
        // Or specific regions added.

        // Simple strategy: 
        // 1. If lastFilledRegions is empty -> Draw Background + Borders.
        // 2. If filledRegions grew -> Draw ONLY new regions.
        // 3. If filledRegions shrank (Undo) -> Full Redraw (Can be optimized later but undo is rare).
        // 4. If Palette changes -> Full Redraw (Theme change).

        const isFullRedraw = lastFilledRegionsRef.current.size === 0 ||
            filledRegions.size < lastFilledRegionsRef.current.size ||
            // Detect Palette Change? We rely on 'palette' dependency in useEffect. 
            // If palette changes, we probably need full redraw. 
            // But we can't easily detect 'palette changed' vs 'filledRegions changed' inside one effect unless we split them or use refs.
            // Let's assume performant partial updates for fills, full redraw for everything else.
            true; // For now, let's optimize the loop inside.

        // Optimization: Delta updates
        // To do delta updates correctly, we need to know exactly WHICH ID was added.
        // Comparing Sets is O(N).
        // For now, let's do a smart redraw:
        // Always redraw background + filled regions. It's faster than `putImageData` for every pixel if we do it in one pass using typed arrays?
        // NO. The whole point is to AVOID iterating all regions.

        // Let's use `isFullRedraw` logic properly.
        const prevSize = lastFilledRegionsRef.current.size;
        const currSize = filledRegions.size;

        // We need to check if we can do partial update.
        // Only if (curr > prev) AND (palette matches? We'll assume palette serves as key for effect re-run).

        // Actually, let's just use a persistent ImageData buffer?
        // No, using canvas 2D generic drawing for caching is standard.

        // Re-implementing Full Redraw for correctness first, but optimizing the method.
        // Then partials.

        // To make it FAST:
        // 1. Create ImageData ONCE.
        // 2. Mutate it.
        // 3. Put it back.

        const imgData = ctx.getImageData(0, 0, w, h); // Read current state? No, read blank if full redraw.
        const buf = new Uint32Array(imgData.data.buffer);

        if (prevSize === 0 || currSize < prevSize) {
            // Full Clear
            buf.fill(0xFFFFFFFF); // White
        }

        // We need to identify New Regions vs All Regions.
        // If we clear, we loop ALL filledRegions.
        // If we partial, we need 'added' regions.

        // Let's stick to a reasonably fast Full Redraw of the backing buffer for now, 
        // because `data.regions.forEach` is fast enough (JS loop), the bottleneck was `putImageData` happening on EVERY ANIMATION FRAME.
        // By moving it to this useEffect, we ONLY do it when state changes, NOT when ripples animate.
        // This alone sends performance from "Laggy" to "Smooth" during animations.

        // So, FULL REDRAW of caching canvas here is fine, as long as it's not in `draw()`.

        // 1. Clear/Init
        if (prevSize === 0 || currSize < prevSize) {
            buf.fill(0xFFFFFFFF);

            // Borders (rendering borders into cache is good)
            if (config.showBorders) {
                // Grey borders
                const borderVal = (255 << 24) | (219 << 16) | (213 << 8) | 209; // #d1d5db / 209, 213, 219
                data.regions.forEach(region => {
                    if (!filledRegions.has(region.id)) {
                        for (const pIdx of region.borderPixels) buf[pIdx] = borderVal;
                    }
                });
            }
        }

        // 2. Draw Fills
        // If we cleared, we draw all.
        // If we didn't clear, we only draw new ones... but finding new ones is O(N) Set diff.
        // If we just draw ALL filled regions every time state changes, is it too slow?
        // For 1000 regions, yes.
        // BUT, we only do this on CLICK. Not on hover/animate. So 60fps is not required here. Instant response is required.
        // 100ms is acceptable. 16ms is better.

        // Optimization: Only iterate if needed?
        // Let's iterate ALL filled regions for robustness.
        filledRegions.forEach(rId => {
            const region = data.regions.find(r => r.id === rId);
            if (region) {
                const c = palette[region.colorId].rgb;
                // ABGR for little endian
                const colorVal = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
                for (const pIdx of region.pixels) buf[pIdx] = colorVal;
            }
        });

        ctx.putImageData(imgData, 0, 0);
        lastFilledRegionsRef.current = new Set(filledRegions);

    }, [filledRegions, data, palette, config.showBorders]);

    // --- Drawing Logic (The Render Loop) ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear Main Canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const w = data.originalWidth;

        // 1. Draw Cached Layer (Background + Fills + Borders)
        if (offscreenCanvasRef.current) {
            ctx.drawImage(offscreenCanvasRef.current, 0, 0);
        }

        // 2. Highlight Active Color (Dynamic)
        if (config.highlightActive && activeColor) {
            ctx.fillStyle = activeColor.hex + '66'; // 40% opacity
            // This loop is unavoidable for dynamic highlight, but it's only for ONE color ID.
            // Optimization: Filter regions first? No, iterate map/array? Data.regions is array.
            // Can we pre-group regions by ColorID? That would be O(1) lookup.
            // Doing O(N) here is okay-ish if N < 5000.

            // Optimization: Skip if zoomed out? No, users need highlight to find.
            data.regions.forEach(region => {
                if (!filledRegions.has(region.id) && region.colorId === activeColor.id - 1) {
                    for (const pIdx of region.pixels) {
                        // Draw rects is slow. But we can't use putImageData easily on top of existing context without readback.
                        // Actually, drawing thousands of 1x1 rects is THE KILLER.
                        // Better: Create a temporary ImageData, fill it transparent, paint pixels, putImageData.

                        // Since we are clearing canvas, we can't just overwrite.
                        // But we can `ctx.fillRect`.
                        // Note: `fillRect` is GPU accelerated but overhead of call is high.
                        // Pixel manipulation on CPU -> putImageData is usually faster for pixel art.

                        // HYBRID approach:
                        // We are already using `drawImage` for base.
                        // Let's try `ctx.fillRect` first. If it lags, we optimize.
                        // The original code handled this inside the main loop.

                        ctx.fillRect(pIdx % w, Math.floor(pIdx / w), 1, 1);
                    }
                }
            });
        }

        // 3. Flash Error
        if (flashRegion) {
            const now = performance.now();
            const diff = now - flashRegion.start;
            if (diff < 400) {
                const alpha = Math.max(0, 1 - diff / 400);
                const region = data.regions.find(r => r.id === flashRegion!.id);
                if (region) {
                    ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
                    for (const pIdx of region.pixels) {
                        ctx.fillRect(pIdx % w, Math.floor(pIdx / w), 1, 1);
                    }
                }
            } else {
                setFlashRegion(null);
            }
        }

        // 4. Ripples
        if (ripplesRef.current.length > 0) {
            ripplesRef.current.forEach((ripple, idx) => {
                ctx.beginPath();
                ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
                ctx.fillStyle = ripple.color;
                ctx.globalAlpha = ripple.alpha;
                ctx.fill();
                ctx.globalAlpha = 1.0;

                // Update state for next frame
                ripple.r += 2 / scale; // Scale speed relative to zoom
                ripple.alpha -= 0.05;
            });
            ripplesRef.current = ripplesRef.current.filter(r => r.alpha > 0);
        }

        // 5. Numbers
        if (config.showNumbers) {
            const fontSize = Math.max(12, Math.floor(data.originalWidth / 120));
            // Viewport Culling
            // Calculate visible bounds in world coordinates
            const viewportLeft = -offset.x / scale;
            const viewportTop = -offset.y / scale;
            const viewportRight = (containerRef.current?.clientWidth || 0) / scale + viewportLeft;
            const viewportBottom = (containerRef.current?.clientHeight || 0) / scale + viewportTop;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            data.regions.forEach(region => {
                // Cull invisible regions
                if (region.centroid.x < viewportLeft || region.centroid.x > viewportRight ||
                    region.centroid.y < viewportTop || region.centroid.y > viewportBottom) {
                    return;
                }

                const isFilled = filledRegions.has(region.id);

                // Only show numbers if not filled OR if filled but we want to see them
                if (!isFilled) {
                    const approximateScreenSize = Math.sqrt(region.pixels.length) * scale;
                    if (approximateScreenSize > 12) {
                        const paletteColor = palette[region.colorId];
                        const isActive = activeColor && (region.colorId === activeColor.id - 1);
                        if (isActive) {
                            ctx.fillStyle = '#000000';
                            ctx.font = `bold ${fontSize * 1.3}px sans-serif`;
                        } else {
                            ctx.fillStyle = '#9ca3af';
                            ctx.font = `bold ${fontSize}px sans-serif`;
                        }
                        const num = paletteColor.id;
                        ctx.fillText(num.toString(), region.centroid.x, region.centroid.y);
                    }
                } else {
                    const approximateScreenSize = Math.sqrt(region.pixels.length) * scale;
                    if (approximateScreenSize > 40 && scale > 2) {
                        const paletteColor = palette[region.colorId];
                        ctx.fillStyle = paletteColor.textColor;
                        ctx.globalAlpha = 0.5;
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.fillText(paletteColor.id.toString(), region.centroid.x, region.centroid.y);
                        ctx.globalAlpha = 1.0;
                    }
                }
            });
        }

        // Keep animating if we have ripples or flash
        if (ripplesRef.current.length > 0 || flashRegion) {
            animFrameRef.current = requestAnimationFrame(draw);
        }

    }, [data, palette, filledRegions, config, scale, flashRegion, activeColor, offset]);

    // Trigger draw when dependencies change, but use RAF for the heavy lifting inside draw() if needed
    useEffect(() => {
        draw();
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [draw]);

    // --- Hint System (Smart Navigation) ---
    const useHint = () => {
        if (!activeColor) return;

        // Find unfilled regions of active color
        const candidates = data.regions
            .filter(r => r.colorId === activeColor.id - 1 && !filledRegions.has(r.id))
            .sort((a, b) => a.pixels.length - b.pixels.length); // Smallest first

        if (candidates.length === 0) {
            onToast("This color is complete!", 'success');
            return;
        }

        // Cycle through candidates
        const target = candidates[hintIndex % candidates.length];
        setHintIndex(prev => prev + 1);

        if (containerRef.current) {
            const { clientWidth, clientHeight } = containerRef.current;
            const newScale = Math.min(6, 250 / Math.sqrt(target.pixels.length)); // Smart zoom

            // Center target
            const newOffsetX = (clientWidth / 2) - (target.centroid.x * newScale);
            const newOffsetY = (clientHeight / 2) - (target.centroid.y * newScale);

            onZoom(newScale);
            onPan(newOffsetX, newOffsetY);

            // Flash it
            setFlashRegion({ id: target.id, start: performance.now() });
        }
    };


    // --- Handlers ---

    const performFill = (clientX: number, clientY: number) => {
        if (showOriginal) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = Math.floor((clientX - rect.left) / scale);
        const y = Math.floor((clientY - rect.top) / scale);

        if (x < 0 || x >= data.originalWidth || y < 0 || y >= data.originalHeight) return;

        const pIdx = y * data.originalWidth + x;
        const regionId = data.regionMap[pIdx];

        if (regionId >= 0 && activeColor) {
            const region = data.regions.find(r => r.id === regionId);
            if (region) {
                const isMatch = activeColor.id - 1 === region.colorId;
                const isAlreadyFilled = filledRegions.has(regionId);

                if (isMatch) {
                    if (!isAlreadyFilled) {
                        onFillRegion(regionId);
                        // Add Ripple
                        ripplesRef.current.push({
                            x: x,
                            y: y,
                            r: 5,
                            color: activeColor.hex,
                            alpha: 1.0,
                            id: Date.now()
                        });
                        draw(); // Force immediate draw for ripple start
                    }
                } else {
                    if (isAlreadyFilled) {
                        if (isMatch) {
                            onFillRegion(regionId); // No-op logic but triggers UI feedback
                            ripplesRef.current.push({
                                x: x, y: y, r: 5, color: activeColor.hex, alpha: 1.0, id: Date.now()
                            });
                            draw();
                        }
                    } else {
                        setFlashRegion({ id: regionId, start: performance.now() });
                    }
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
        } else {
            performFill(e.clientX, e.clientY);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDraggingRef.current && effectiveTool === ToolMode.PAN) {
            onPan(
                e.clientX - offsetStartRef.current.x,
                e.clientY - offsetStartRef.current.y
            );
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        isDraggingRef.current = false;
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const zoomSensitivity = 0.001;
        const newScale = Math.max(0.05, Math.min(10, scale - e.deltaY * zoomSensitivity));
        onZoom(newScale);
    };

    // --- Touch Logic ---
    const touchStartDistRef = useRef<number>(0);
    const touchStartCenterRef = useRef<{ x: number, y: number } | null>(null);
    const isPinchingRef = useRef(false);
    const lastTouchRef = useRef<{ x: number, y: number } | null>(null);

    const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.hypot(dx, dy);
    };

    const getTouchCenter = (t1: React.Touch, t2: React.Touch) => {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            isPinchingRef.current = true;
            touchStartDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
            touchStartCenterRef.current = getTouchCenter(e.touches[0], e.touches[1]);
            offsetStartRef.current = { ...offset };
        } else if (e.touches.length === 1) {
            isPinchingRef.current = false;
            lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

            if (effectiveTool === ToolMode.PAN) {
                isDraggingRef.current = true;
                offsetStartRef.current = { x: offset.x, y: offset.y };
                dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            isDraggingRef.current = true;
            dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            offsetStartRef.current = { ...offset };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && isPinchingRef.current) {
            const dist = getTouchDistance(e.touches[0], e.touches[1]);
            const center = getTouchCenter(e.touches[0], e.touches[1]);

            onZoom(Math.max(0.1, Math.min(10, scale * (dist / touchStartDistRef.current))));
            touchStartDistRef.current = dist;

            if (lastTouchRef.current) {
                const dx = center.x - lastTouchRef.current.x;
                const dy = center.y - lastTouchRef.current.y;
                onPan(offset.x + dx, offset.y + dy);
                lastTouchRef.current = center;
            }

            e.preventDefault();
        } else if (e.touches.length === 1 && isDraggingRef.current) {
            const t = e.touches[0];
            const dx = t.clientX - lastTouchRef.current!.x;
            const dy = t.clientY - lastTouchRef.current!.y;

            onPan(offset.x + dx, offset.y + dy);
            lastTouchRef.current = { x: t.clientX, y: t.clientY };
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        isPinchingRef.current = false;
        touchStartCenterRef.current = null;

        if (isDraggingRef.current && e.changedTouches.length === 1 && e.touches.length === 0) {
            const start = dragStartRef.current;
            const end = e.changedTouches[0];
            const dist = Math.hypot(end.clientX - start.x, end.clientY - start.y);

            if (dist < 10) {
                performFill(end.clientX, end.clientY);
            }
        }
        isDraggingRef.current = false;
    };

    const getCursor = () => {
        if (effectiveTool === ToolMode.PAN) return isDraggingRef.current ? 'grabbing' : 'grab';
        return PAINT_BUCKET_CURSOR;
    };

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
                width={data.originalWidth}
                height={data.originalHeight}
                className="absolute origin-top-left rendering-pixelated shadow-2xl transition-opacity duration-200"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    imageRendering: 'auto'
                }}
            />

            {/* Overlay for Original Image */}
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

            {/* Smart Navigation / Hint Button */}
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
