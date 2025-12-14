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

    // Performance Optimization: Offscreen Canvas Caches
    // baseLayer: Background + Borders + Filled Regions (High Res)
    const baseLayerRef = useRef<HTMLCanvasElement | null>(null);
    // highlightLayer: Active Color Highlights (High Res)
    const highlightLayerRef = useRef<HTMLCanvasElement | null>(null);

    // State Tracking for caching
    const lastFilledRegionsRef = useRef<Set<number>>(new Set());
    const lastActiveColorIdRef = useRef<number | null>(null);
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

    // Determine Effective Tool (Spacebar overrides)
    const effectiveTool = isSpaceHeld ? ToolMode.PAN : activeTool;

    // Viewport State (for resizing)
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    // --- Init & Resize Observer ---
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Update viewport size state to trigger re-render of canvas element size
                setViewportSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
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

    // Reset hint index when active color changes
    useEffect(() => {
        setHintIndex(0);
    }, [activeColor]);

    // --- Base Layer Cache Management (Additive Updates) ---
    useEffect(() => {
        const w = data.originalWidth;
        const h = data.originalHeight;

        // Init Base Layer
        if (!baseLayerRef.current) {
            baseLayerRef.current = document.createElement('canvas');
            baseLayerRef.current.width = w;
            baseLayerRef.current.height = h;
        } else if (baseLayerRef.current.width !== w || baseLayerRef.current.height !== h) {
            baseLayerRef.current.width = w;
            baseLayerRef.current.height = h;
            lastFilledRegionsRef.current = new Set(); // Reset cache tracker
        }

        const ctx = baseLayerRef.current.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Decision: Full Redraw vs Delta Update
        const prevSize = lastFilledRegionsRef.current.size;
        const currSize = filledRegions.size;

        // Full Redraw Conditions:
        // 1. First Run (prevSize === 0)
        // 2. Clear / Undo (currSize < prevSize)
        // 3. Borders Toggle Changed
        const bordersChanged = lastShowBordersRef.current !== config.showBorders;
        const isFullRedraw = lastFilledRegionsRef.current.size === 0 || currSize < prevSize || bordersChanged;

        if (isFullRedraw) {
            // --- FULL REDRAW ---
            // 1. Background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);

            // 2. Borders & Fills
            // Using ImageData for batch processing is fastest for full redraws
            const imgData = ctx.getImageData(0, 0, w, h);
            const buf = new Uint32Array(imgData.data.buffer);

            const borderVal = (255 << 24) | (219 << 16) | (213 << 8) | 209; // #d1d5db

            // Draw Borders first (if enabled)
            if (config.showBorders) {
                // Optimization directly iterating regions
                for (let i = 0; i < data.regions.length; i++) {
                    const region = data.regions[i];
                    // Only draw borders for UNFILLED regions?
                    // Original logic: if (!filledRegions.has(region.id)) render borders
                    if (!filledRegions.has(region.id)) {
                        for (let j = 0; j < region.borderPixels.length; j++) {
                            buf[region.borderPixels[j]] = borderVal;
                        }
                    }
                }
            }

            // Draw Filled Regions
            // Using set iteration
            filledRegions.forEach(rId => {
                const region = data.regions.find(r => r.id === rId);
                if (region) {
                    const c = palette[region.colorId].rgb;
                    const colorVal = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
                    for (let j = 0; j < region.pixels.length; j++) {
                        buf[region.pixels[j]] = colorVal;
                    }
                }
            });

            ctx.putImageData(imgData, 0, 0);

        } else {
            // --- DELTA UPDATE (Additive) ---
            // Draw only newly added regions.
            // Loop through CURRENT filled regions. If NOT in LAST, draw it.
            // Optimization: Iterate filledRegions (smaller than all regions).

            filledRegions.forEach(rId => {
                if (!lastFilledRegionsRef.current.has(rId)) {
                    // New fill!
                    const region = data.regions.find(r => r.id === rId);
                    if (region) {
                        const c = palette[region.colorId].rgb;
                        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;

                        // Use fillRect for new pixels. 
                        // Faster than putImageData for small updates.
                        for (const pIdx of region.pixels) {
                            ctx.fillRect(pIdx % w, Math.floor(pIdx / w), 1, 1);
                        }
                    }
                }
            });
        }

        lastFilledRegionsRef.current = new Set(filledRegions);
        lastShowBordersRef.current = config.showBorders;

    }, [filledRegions, data, palette, config.showBorders]);

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

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Draw Highlights if enabled
        if (config.highlightActive && activeColor) {
            ctx.fillStyle = activeColor.hex + '66'; // 40% opacity

            data.regions.forEach(region => {
                // Skip filled regions
                if (!filledRegions.has(region.id) && region.colorId === activeColor.id - 1) {
                    for (const pIdx of region.pixels) {
                        ctx.fillRect(pIdx % w, Math.floor(pIdx / w), 1, 1);
                    }
                }
            });
        }

    }, [activeColor, config.highlightActive, filledRegions, data]);

    // --- Main Render Loop (Viewport Rendering) ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const vW = canvas.width;
        const vH = canvas.height;

        // 1. Clear Viewport
        ctx.clearRect(0, 0, vW, vH);

        // Calculate Source Rect
        // Source Image Coordinates that map to Viewport [0,0, vW, vH]
        // viewPixel = imagePixel * scale + offset
        // imagePixel = (viewPixel - offset) / scale

        const sX = -offset.x / scale;
        const sY = -offset.y / scale;
        const sW = vW / scale;
        const sH = vH / scale;

        // 2. Draw Base Layer (Clipped)
        if (baseLayerRef.current) {
            ctx.drawImage(baseLayerRef.current, sX, sY, sW, sH, 0, 0, vW, vH);
        }

        // 3. Draw Highlight Layer (Clipped)
        if (highlightLayerRef.current && config.highlightActive && activeColor) {
            ctx.drawImage(highlightLayerRef.current, sX, sY, sW, sH, 0, 0, vW, vH);
        }

        // 4. Flash Error (Dynamic)
        if (flashRegion) {
            const now = performance.now();
            const diff = now - flashRegion.start;
            if (diff < 400) {
                const alpha = Math.max(0, 1 - diff / 400);
                const region = data.regions.find(r => r.id === flashRegion!.id);
                if (region) {
                    ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
                    ctx.beginPath();
                    // Optimization: Check bounds first?
                    // Just drawing path in screen space
                    for (const pIdx of region.pixels) {
                        const rX = pIdx % data.originalWidth;
                        const rY = Math.floor(pIdx / data.originalWidth);

                        const dX = rX * scale + offset.x;
                        const dY = rY * scale + offset.y; // Fixed calculation

                        // Simple Culling to prevent drawing off-screen
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

        // 5. Ripples (Dynamic)
        if (ripplesRef.current.length > 0) {
            ripplesRef.current.forEach((ripple, idx) => {
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

        // 6. Numbers (Dynamic & Culled)
        if (config.showNumbers) {
            const fontSize = Math.max(12, Math.floor(data.originalWidth / 120));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Define Visible Image Bounds basically sX, sY, sW, sH
            const left = sX;
            const top = sY;
            const right = sX + sW;
            const bottom = sY + sH;

            // Only iterate numbers if possible... scanning 5000 regions every frame?
            // Yes, it's JS loop vs Render, JS loop is fast. 
            // 5000 iterations is ~0.1ms. Drawing is the cost.

            data.regions.forEach(region => {
                // 1. Cull invisible
                if (region.centroid.x < left || region.centroid.x > right ||
                    region.centroid.y < top || region.centroid.y > bottom) {
                    return;
                }

                const isFilled = filledRegions.has(region.id);
                const screenX = region.centroid.x * scale + offset.x;
                const screenY = region.centroid.y * scale + offset.y;

                if (!isFilled) {
                    // Logic: Only show if big enough
                    const approximateScreenSize = Math.sqrt(region.pixels.length) * scale;
                    if (approximateScreenSize > 12) {
                        const paletteColor = palette[region.colorId];
                        const isActive = activeColor && (region.colorId === activeColor.id - 1);

                        if (isActive) {
                            ctx.fillStyle = '#000000';
                            // Capped font size to avoid massive letters when zoomed in
                            ctx.font = `bold ${Math.min(40, fontSize * scale)}px sans-serif`;
                        } else {
                            ctx.fillStyle = '#9ca3af';
                            ctx.font = `bold ${Math.min(30, fontSize * scale)}px sans-serif`;
                        }

                        ctx.fillText(paletteColor.id.toString(), screenX, screenY);
                    }
                } else {
                    // Filled Check
                    const approximateScreenSize = Math.sqrt(region.pixels.length) * scale;
                    if (approximateScreenSize > 40 && scale > 2) {
                        const paletteColor = palette[region.colorId];
                        ctx.fillStyle = paletteColor.textColor;
                        ctx.globalAlpha = 0.5;
                        ctx.font = `bold ${Math.min(30, fontSize * scale)}px sans-serif`;
                        ctx.fillText(paletteColor.id.toString(), screenX, screenY);
                        ctx.globalAlpha = 1.0;
                    }
                }
            });
        }

        // Animate
        if (ripplesRef.current.length > 0 || flashRegion) {
            animFrameRef.current = requestAnimationFrame(draw);
        }

    }, [data, palette, filledRegions, config, scale, offset, flashRegion, activeColor, viewportSize]);

    // Trigger draw
    useEffect(() => {
        draw();
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [draw]);

    // --- Hint System (Smart Navigation) ---
    const useHint = () => {
        if (!activeColor) return;
        const candidates = data.regions
            .filter(r => r.colorId === activeColor.id - 1 && !filledRegions.has(r.id))
            .sort((a, b) => a.pixels.length - b.pixels.length);

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


    // --- Handlers ---
    const performFill = (clientX: number, clientY: number) => {
        if (showOriginal) return;
        const rect = canvasRef.current!.getBoundingClientRect();

        // Correct Mouse to Image Space transform
        // The Canvas is strictly mapped to Viewport.
        // So (clientX - rect.left) IS the Viewport X.

        const viewX = clientX - rect.left;
        const viewY = clientY - rect.top;

        // viewX = imageX * scale + offset
        // imageX = (viewX - offset) / scale

        const x = Math.floor((viewX - offset.x) / scale);
        const y = Math.floor((viewY - offset.y) / scale);

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
                        ripplesRef.current.push({
                            x: x, y: y, r: 5, color: activeColor.hex, alpha: 1.0, id: Date.now()
                        });
                        // Don't force draw() here, rely on effect
                    }
                } else {
                    if (isAlreadyFilled) {
                        if (isMatch) {
                            // Already filled with correct color
                            onFillRegion(regionId);
                            ripplesRef.current.push({
                                x: x, y: y, r: 5, color: activeColor.hex, alpha: 1.0, id: Date.now()
                            });
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
            const dx = t.clientX - lastTouchRef.current!.x;
            const dy = t.clientY - lastTouchRef.current!.y;
            onPan(offset.x + dx, offset.y + dy);
            lastTouchRef.current = { x: t.clientX, y: t.clientY };
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
            {/* Viewport Canvas (Sized to Container) */}
            <canvas
                ref={canvasRef}
                width={viewportSize.width}
                height={viewportSize.height}
                className="absolute top-0 left-0 rendering-pixelated shadow-2xl transition-opacity duration-200"
                style={{ imageRendering: 'auto' }}
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

            {/* Hint Button */}
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
