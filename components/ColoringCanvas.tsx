import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  onToast
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Viewport
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  
  // Keyboard Modifiers
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  // Interaction State
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 }); 
  const offsetStartRef = useRef({ x: 0, y: 0 });

  // Animation State
  const [flashRegion, setFlashRegion] = useState<{id: number, start: number} | null>(null);
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

  // --- Drawing Logic ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = data.originalWidth;
    const imgData = ctx.createImageData(w, data.originalHeight);
    const buf = new Uint32Array(imgData.data.buffer);

    // Background
    buf.fill(0xFFFFFFFF); 

    // Filled Regions
    data.regions.forEach(region => {
      const isFilled = filledRegions.has(region.id);
      let r = 255, g = 255, b = 255; 
      
      if (isFilled) {
        const c = palette[region.colorId].rgb;
        r = c.r; g = c.g; b = c.b;
      }
      
      const colorVal = (255 << 24) | (b << 16) | (g << 8) | r;
      if (isFilled) {
         for (const pIdx of region.pixels) buf[pIdx] = colorVal;
      }
    });

    ctx.putImageData(imgData, 0, 0);

    // Highlight Active Color
    if (config.highlightActive && activeColor) {
      ctx.fillStyle = activeColor.hex + '66'; // 40% opacity
      data.regions.forEach(region => {
        if (!filledRegions.has(region.id) && region.colorId === activeColor.id - 1) {
            for (const pIdx of region.pixels) {
                ctx.fillRect(pIdx % w, Math.floor(pIdx / w), 1, 1);
            }
        }
      });
    }

    // Borders
    if (config.showBorders) {
       ctx.fillStyle = '#d1d5db'; 
       data.regions.forEach(region => {
         if (!filledRegions.has(region.id)) {
            for(const pIdx of region.borderPixels) {
               ctx.fillRect(pIdx % w, Math.floor(pIdx / w), 1, 1);
            }
         }
       });
    }

    // Flash Error
    if (flashRegion) {
        const now = performance.now();
        const diff = now - flashRegion.start;
        if (diff < 400) { 
            const alpha = Math.max(0, 1 - diff / 400);
            const region = data.regions.find(r => r.id === flashRegion.id);
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

    // Ripples
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
        // Cleanup
        ripplesRef.current = ripplesRef.current.filter(r => r.alpha > 0);
    }

    // Numbers
    if (config.showNumbers) {
      const fontSize = Math.max(12, Math.floor(data.originalWidth / 120));
      // Adjust font size based on zoom scale, but clamp it to avoid massive text
      // We want text to stay relatively consistent in world space, but readable.
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      data.regions.forEach(region => {
        const isFilled = filledRegions.has(region.id);
        
        // Only show numbers if not filled OR if filled but we want to see them (usually we hide them)
        // Standard UX: Hide number when filled.
        if (!isFilled) {
           // Visibility Logic:
           // If region is tiny and we are zoomed out -> Hide
           // If region is tiny and we are zoomed in -> Show
           const approximateScreenSize = Math.sqrt(region.pixels.length) * scale;
           
           if (approximateScreenSize > 12) {
             const paletteColor = palette[region.colorId];
             
             // High contrast logic: 
             // If the region is highlighted (active color), we need contrast against the highlight color.
             // If not highlighted, we need contrast against white (background).
             // Actually, simplest is: Active Color -> Black text (because highlight is usually light overlay or we want it to pop).
             // Inactive -> Grey text.
             
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
            // Optional: If filled, show number in contrast color if zoomed in a lot?
            // Users complain about not knowing what color a filled region IS.
            const approximateScreenSize = Math.sqrt(region.pixels.length) * scale;
            if (approximateScreenSize > 40 && scale > 2) {
                // Show number faintly in contrast color
                const paletteColor = palette[region.colorId];
                ctx.fillStyle = paletteColor.textColor; // Smart contrast (White on dark, Black on light)
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

  }, [data, palette, filledRegions, config, scale, flashRegion, activeColor]);

  // Trigger draw when dependencies change, but use RAF for the heavy lifting inside draw() if needed
  useEffect(() => {
    draw();
    // No cancel here because draw might be recursive via RAF. 
    // Actually, we should cancel previous frame to avoid stacking.
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // Center Image initially
  const centerImage = useCallback(() => {
     if(containerRef.current) {
         const { clientWidth, clientHeight } = containerRef.current;
         const scaleX = clientWidth / data.originalWidth;
         const scaleY = clientHeight / data.originalHeight;
         const startScale = Math.min(scaleX, scaleY, 1) * 0.9;
         setScale(startScale);
         setOffset({
             x: (clientWidth - data.originalWidth * startScale) / 2,
             y: (clientHeight - data.originalHeight * startScale) / 2
         });
     }
  }, [data]);

  useEffect(() => {
     centerImage();
  }, [centerImage]);

  // --- Hint System (Smart Navigation) ---
  const useHint = () => {
    if (!activeColor) return;
    
    // Find unfilled regions of active color
    const candidates = data.regions
        .filter(r => r.colorId === activeColor.id - 1 && !filledRegions.has(r.id))
        .sort((a,b) => a.pixels.length - b.pixels.length); // Smallest first
    
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
        
        // Smooth transition (React state update triggers re-render, CSS transition handles smoothness if applied, 
        // but here we are using canvas + absolute pos. We set state directly.)
        setScale(newScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
        
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
            // Logic: 
            // 1. If correct color match -> Fill
            // 2. If region is ALREADY filled -> Allow overwrite if color is different (Correction mode)
            // 3. If wrong color -> Flash error
            
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
                // Wrong color clicked
                if (isAlreadyFilled) {
                    // It's already filled, but maybe they want to change it? 
                    // Only allow change if the clicked region matches the *active* color (meaning they are fixing a mistake)
                    // Wait, if I have Red selected, and I click a region that is supposed to be Red but I previously colored Blue...
                    // The region.colorId is Red.
                    // So `isMatch` would be true.
                    // Ah, `isMatch` compares ActiveColor vs TrueRegionColor.
                    
                    // So if `isMatch` is true, we should allow filling even if `isAlreadyFilled` is true.
                    if (isMatch) {
                         // Correcting a mistake
                         onFillRegion(regionId); // Logic in App.tsx handles Set addition, which is idempotent. 
                         // But we need a way to say "Update visual". The Set handles existence. 
                         // Since it's already in the Set, we just need the Ripple to show "Good job fixing it".
                         ripplesRef.current.push({
                            x: x, y: y, r: 5, color: activeColor.hex, alpha: 1.0, id: Date.now()
                        });
                        draw();
                    }
                } else {
                   // Not filled, and wrong color. Flash error.
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
        setOffset({
            x: e.clientX - offsetStartRef.current.x,
            y: e.clientY - offsetStartRef.current.y
        });
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
      setScale(newScale);
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

        {/* On-Canvas Controls */}
        <div 
            className="absolute bottom-6 right-6 flex flex-col gap-2 p-2 bg-gray-900/80 backdrop-blur rounded-xl border border-gray-700 shadow-xl pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()} 
        >
            <button 
                onClick={() => setScale(s => Math.min(10, s * 1.2))}
                className="p-2 hover:bg-gray-700 rounded-lg text-white"
                title="Zoom In"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </button>
            <button 
                onClick={() => setScale(s => Math.max(0.1, s / 1.2))}
                className="p-2 hover:bg-gray-700 rounded-lg text-white"
                title="Zoom Out"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
            </button>
            <button 
                onClick={centerImage}
                className="p-2 hover:bg-gray-700 rounded-lg text-white"
                title="Reset View"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            </button>
        </div>

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