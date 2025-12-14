import React, { useState, useMemo, useEffect } from 'react';
import { createClient } from "@openauthjs/openauth/client";
import { AppStage, ProcessedImage, PaletteColor, ToolConfig, PaletteTheme, ToolMode, ToastMessage, AI_STYLES } from './types';
import { processImageForColoring } from './services/imageProcessor';
import { remixImage, generateImageFromPrompt } from './services/geminiService';
import { applyTheme } from './utils/colorThemes';
import ColoringCanvas from './components/ColoringCanvas';
import ToastContainer from './components/ToastContainer';

// SVG Icons
const Icons = {
  Upload: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  Wand: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
  Undo: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>,
  Download: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4 4m4 4V4" /></svg>,
  Eye: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
  Bucket: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11zM5 2l5 5M2 13l2.6-2.6M22 13a3 3 0 0 0-3 3 7 7 0 0 1-7 7" /></svg>,
  Hand: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>,
  Bulb: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  Check: () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
};

const authClient = createClient({
  clientID: "chromanumber-client",
  issuer: "https://openauth-template.kristain33rs.workers.dev",
});

const App: React.FC = () => {
  const [stage, setStage] = useState<AppStage>(AppStage.UPLOAD);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Remix & Generation State
  const [remixPrompt, setRemixPrompt] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Coloring State
  const [activeColor, setActiveColor] = useState<PaletteColor | null>(null);
  const [activeTheme, setActiveTheme] = useState<PaletteTheme>(PaletteTheme.STANDARD);
  const [activeTool, setActiveTool] = useState<ToolMode>(ToolMode.FILL);
  const [filledRegions, setFilledRegions] = useState<Set<number>>(new Set());
  const [showOriginal, setShowOriginal] = useState(false);
  const [toolConfig, setToolConfig] = useState<ToolConfig>({
    brushSize: 1,
    showNumbers: true,
    showBorders: true,
    smartFill: true,
    highlightActive: false,
  });
  const [showCelebration, setShowCelebration] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'none' | 'colors' | 'tools' | 'settings'>('none');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const initAuth = async () => {
      const token = new URLSearchParams(window.location.search).get("code");
      if (token) {
        try {
          const exchanged = await authClient.authorize(window.location.search);
          localStorage.setItem("access_token", exchanged.access);
          window.history.replaceState({}, "", "/");
        } catch (e) {
          console.error(e);
        }
      }

      const savedToken = localStorage.getItem("access_token");
      if (savedToken) {
        try {
          // Verify token or fetch user info here (mocked for now as we don't have a userinfo endpoint on the template by default, 
          // but valid token presence implies login)
          const payload = JSON.parse(atob(savedToken.split('.')[1]));
          setUser({ id: payload.sub });
        } catch (e) {
          console.error("Invalid token", e);
          localStorage.removeItem("access_token");
        }
      }
    };
    initAuth();
  }, []);

  const handleLogin = async () => {
    const { url } = await authClient.authorize(window.location.origin, "code");
    window.location.href = url;
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    setUser(null);
    addToast("Logged out successfully", 'info');
  };

  // Toast Handler
  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // Computed Values
  const currentPalette = useMemo(() => {
    if (!processedData) return [];
    return applyTheme(processedData.palette, activeTheme);
  }, [processedData, activeTheme]);

  // Map of ColorID -> Count of regions filled
  const colorProgressMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!processedData) return map;

    // Initialize with 0
    processedData.palette.forEach(c => map.set(c.id, 0));

    filledRegions.forEach(rId => {
      const region = processedData.regions.find(r => r.id === rId);
      if (region) {
        const cId = processedData.palette[region.colorId].id;
        map.set(cId, (map.get(cId) || 0) + region.pixels.length);
      }
    });
    return map;
  }, [filledRegions, processedData]);

  const totalPixels = useMemo(() => processedData ? processedData.originalWidth * processedData.originalHeight : 1, [processedData]);
  const progress = useMemo(() => {
    if (!processedData) return 0;
    // Calculate based on filled PIXELS not regions for accuracy
    let filledPixels = 0;
    filledRegions.forEach(rId => {
      const region = processedData.regions.find(r => r.id === rId);
      if (region) filledPixels += region.pixels.length;
    });
    return (filledPixels / totalPixels) * 100;
  }, [filledRegions, processedData, totalPixels]);

  // Completion Check
  useEffect(() => {
    if (progress > 99.9 && !showCelebration && stage === AppStage.COLORING) {
      setShowCelebration(true);
      addToast("Masterpiece Complete! 🎉", 'success');
    }
  }, [progress, stage]);

  // Handlers
  const toggleMobileTab = (tab: 'colors' | 'tools' | 'settings') => {
    setActiveMobileTab(current => current === tab ? 'none' : tab);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setSourceImage(ev.target.result as string);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setIsGenerating(true);
    setGeneratedPreview(null);
    try {
      const result = await generateImageFromPrompt(genPrompt, selectedStyle);
      if (result) {
        setGeneratedPreview(result);
        addToast("Image generated successfully!", 'success');
      } else {
        addToast("Could not generate image. Please try again.", 'error');
      }
    } catch (e) {
      console.error(e);
      addToast("Generation failed. Check console.", 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const processImage = async () => {
    if (!sourceImage) return;
    setIsProcessing(true);
    setStage(AppStage.PROCESSING);

    try {
      const img = new Image();
      img.src = sourceImage;
      await new Promise((resolve) => { img.onload = resolve; });

      const canvas = document.createElement('canvas');
      const TARGET_MIN_DIM = 2400;
      const TARGET_MAX_DIM = 3200;

      let w = img.width;
      let h = img.height;
      let scale = 1;

      const maxSide = Math.max(w, h);

      if (maxSide < TARGET_MIN_DIM) {
        scale = TARGET_MIN_DIM / maxSide;
      } else if (maxSide > TARGET_MAX_DIM) {
        scale = TARGET_MAX_DIM / maxSide;
      }

      canvas.width = Math.floor(w * scale);
      canvas.height = Math.floor(h * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas Context Failed");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const result = await processImageForColoring(imageData, 56);
      setProcessedData(result);
      setFilledRegions(new Set());

      if (result.palette.length > 0) setActiveColor(result.palette[0]);
      setStage(AppStage.COLORING);
      addToast("Image processed! Ready to color.", 'success');

    } catch (error) {
      console.error(error);
      addToast("Failed to process image.", 'error');
      setStage(AppStage.UPLOAD);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemix = async () => {
    if (!sourceImage || !remixPrompt.trim()) return;
    setIsProcessing(true);
    try {
      const newImageBase64 = await remixImage(sourceImage, remixPrompt, selectedStyle);
      if (newImageBase64) {
        setSourceImage(newImageBase64);
        setRemixPrompt('');
        addToast("Remix generated!", 'success');
      } else {
        addToast("AI could not generate a remix.", 'error');
      }
    } catch (e) {
      addToast("Error generating remix.", 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    if (!processedData) return;

    const canvas = document.createElement('canvas');
    const w = processedData.originalWidth;
    const h = processedData.originalHeight;
    const isComplete = progress > 99;

    const legendWidth = isComplete ? 0 : 300;
    canvas.width = w + legendWidth;
    canvas.height = Math.max(h, isComplete ? 0 : currentPalette.length * 40 + 50);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const imgData = ctx.createImageData(w, h);
    const buf = new Uint32Array(imgData.data.buffer);
    buf.fill(0xFFFFFFFF);

    processedData.regions.forEach(region => {
      const isFilled = filledRegions.has(region.id) || isComplete;
      let r = 255, g = 255, b = 255;

      if (isFilled) {
        const c = currentPalette[region.colorId].rgb;
        r = c.r; g = c.g; b = c.b;
      }
      const colorVal = (255 << 24) | (b << 16) | (g << 8) | r;
      for (const pIdx of region.pixels) buf[pIdx] = colorVal;
    });
    ctx.putImageData(imgData, 0, 0);

    if (!isComplete) {
      ctx.fillStyle = '#cfcfcf';
      processedData.regions.forEach(region => {
        if (!filledRegions.has(region.id)) {
          for (const pIdx of region.borderPixels) ctx.fillRect(pIdx % w, Math.floor(pIdx / w), 1, 1);

          const fontSize = Math.max(10, Math.floor(w / 120));
          if (region.pixels.length > fontSize * fontSize) {
            ctx.fillStyle = '#9ca3af';
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(currentPalette[region.colorId].id.toString(), region.centroid.x, region.centroid.y);
          }
        }
      });

      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(w, 0, legendWidth, canvas.height);

      ctx.textAlign = 'left';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#111827';
      ctx.fillText("Color Key", w + 20, 40);

      currentPalette.forEach((c, idx) => {
        const y = 80 + idx * 40;
        ctx.fillStyle = c.hex;
        ctx.fillRect(w + 20, y - 20, 30, 30);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(w + 20, y - 20, 30, 30);

        ctx.fillStyle = '#000';
        ctx.font = '16px sans-serif';
        ctx.fillText(`#${c.id}`, w + 60, y);
      });
    }

    const link = document.createElement('a');
    link.download = `chroma-${isComplete ? 'final' : 'worksheet'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    addToast("Image saved to device.", 'success');
  };

  if (stage === AppStage.UPLOAD) {
    return (
      <div className="fixed inset-0 bg-gray-950 text-gray-100 overflow-y-auto custom-scrollbar">
        <div className="min-h-full w-full flex flex-col items-center justify-center p-4 pb-48 md:pb-4">
          <ToastContainer toasts={toasts} removeToast={removeToast} />
          <div className="max-w-xl w-full space-y-8 py-8">
            <div className="text-center">
              <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 mb-4">
                ChromaNumber
              </h1>
              <p className="text-gray-400 text-lg">AI-Powered Precision Coloring</p>
            </div>

            <div className="bg-gray-900 rounded-2xl p-8 shadow-2xl border border-gray-800 space-y-6">
              {sourceImage ? (
                <div className="space-y-6">
                  <div className="relative group rounded-xl overflow-hidden border-2 border-gray-700 bg-gray-950">
                    <img src={sourceImage} alt="Preview" className="w-full object-contain max-h-80" />
                    <button
                      onClick={() => setSourceImage(null)}
                      className="absolute top-2 right-2 p-2 bg-red-600/90 hover:bg-red-600 rounded-full text-white shadow-lg"
                    >
                      <Icons.Undo />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Style Selector */}
                    <select
                      value={selectedStyle}
                      onChange={(e) => setSelectedStyle(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      {AI_STYLES.map(s => <option key={s.label} value={s.value}>{s.label} Style</option>)}
                    </select>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Remix Prompt: e.g. 'Add a sunset'"
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        value={remixPrompt}
                        onChange={(e) => setRemixPrompt(e.target.value)}
                      />
                      <button
                        onClick={handleRemix}
                        disabled={isProcessing || !remixPrompt}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold transition-colors flex items-center gap-2"
                      >
                        {isProcessing ? '...' : <Icons.Wand />}
                      </button>
                    </div>

                    <button
                      onClick={processImage}
                      disabled={isProcessing}
                      className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl font-bold text-lg shadow-lg transform transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {isProcessing ? 'Generating Regions...' : 'Create Coloring Page'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-4 border-dashed border-gray-800 rounded-2xl p-12 text-center hover:border-purple-500 hover:bg-gray-800/30 transition-all cursor-pointer relative group">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={handleFileUpload}
                    />
                    <div className="flex flex-col items-center gap-4 group-hover:scale-105 transition-transform">
                      <div className="p-5 bg-gray-800 rounded-full text-purple-400 shadow-xl">
                        <Icons.Upload />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-300">Upload Image</h3>
                      <p className="text-gray-500">Drag & drop or click to browse</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 py-2">
                    <div className="h-px flex-1 bg-gray-800"></div>
                    <span className="text-gray-500 text-xs font-bold tracking-wider">OR GENERATE WITH AI</span>
                    <div className="h-px flex-1 bg-gray-800"></div>
                  </div>

                  <div className="space-y-4 bg-gray-800/50 p-6 rounded-xl border border-gray-800">
                    {!generatedPreview ? (
                      <>
                        <select
                          value={selectedStyle}
                          onChange={(e) => setSelectedStyle(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none mb-2"
                        >
                          {AI_STYLES.map(s => <option key={s.label} value={s.value}>{s.label} Style</option>)}
                        </select>
                        <textarea
                          placeholder="Describe an image to color (e.g. 'A cute baby dragon sitting on a pile of gold coins')"
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:outline-none min-h-[80px] text-sm resize-none text-gray-200"
                          value={genPrompt}
                          onChange={(e) => setGenPrompt(e.target.value)}
                        />
                        <button
                          onClick={handleGenerate}
                          disabled={isGenerating || !genPrompt}
                          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-white"
                        >
                          {isGenerating ? 'Dreaming...' : <><Icons.Wand /> Generate Image</>}
                        </button>
                      </>
                    ) : (
                      <div className="space-y-4 animate-fade-in">
                        <div className="relative rounded-lg overflow-hidden border-2 border-indigo-500/50">
                          <img src={generatedPreview} className="w-full h-48 object-cover" alt="Generated Preview" />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSourceImage(generatedPreview);
                              setGeneratedPreview(null);
                              setGenPrompt('');
                            }}
                            className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-white shadow-lg"
                          >
                            Use This Image
                          </button>
                          <button
                            onClick={() => setGeneratedPreview(null)}
                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-gray-300"
                          >
                            Try Again
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === AppStage.PROCESSING && !processedData) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center space-y-6">
        <div className="w-20 h-20 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Analyzing Image Topology</h2>
          <p className="text-gray-500">Generating vector regions and palette...</p>
        </div>
      </div>
    )
  }



  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-gray-950 overflow-hidden text-gray-200 font-sans relative">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Celebration Modal */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-gradient-to-br from-purple-900 to-indigo-900 p-8 md:p-10 rounded-3xl text-center shadow-2xl border border-purple-500/50 max-w-md w-full">
            <h2 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-pink-500 mb-4">
              Outstanding!
            </h2>
            <p className="text-gray-200 text-lg mb-8">You've completed the artwork with 100% accuracy.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={downloadImage}
                className="px-6 py-3 bg-white text-purple-900 font-bold rounded-xl shadow-lg hover:scale-105 transition-transform"
              >
                Save Masterpiece
              </button>
              <button
                onClick={() => setShowCelebration(false)}
                className="px-6 py-3 bg-purple-800/50 text-purple-200 font-bold rounded-xl hover:bg-purple-800 transition-colors"
              >
                Keep Admiring
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR (Hidden on Mobile) */}
      <aside className="hidden md:flex w-80 h-full bg-gray-900 border-r border-gray-800 flex-col shrink-0 z-20 shadow-2xl">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900 z-10">
          <h1 className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
            ChromaNumber
          </h1>
          <button
            onClick={() => {
              if (confirm("Exit? Progress lost.")) {
                setStage(AppStage.UPLOAD);
                setSourceImage(null);
                setProcessedData(null);
              }
            }}
            className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition"
            title="Back to Menu"
          >
            <Icons.Undo />
          </button>
        </div>

        {/* User Profile / Login (Desktop) */}
        <div className="p-4 border-b border-gray-800">
          {user ? (
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-green-400">Logged In</span>
              <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-white underline">Logout</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-purple-300 text-sm font-bold rounded-lg border border-purple-500/30">
              Login with GitHub
            </button>
          )}
        </div>

        <div className="p-4 border-b border-gray-800">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold uppercase text-gray-500">
              <span>Completion</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-emerald-600 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {/* Desktop Content (Reusing existing components for brevity in this tool call, assumed copy-paste logic) */}
          {/* Desktop Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onPointerDown={() => setShowOriginal(true)}
              onPointerUp={() => setShowOriginal(false)}
              onPointerLeave={() => setShowOriginal(false)}
              className={`flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all select-none ${showOriginal ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50 scale-95' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 active:scale-95'}`}
            >
              <Icons.Eye /> <span>View</span>
            </button>
            <button
              onClick={downloadImage}
              className="flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-all"
            >
              <Icons.Download /> <span>Save</span>
            </button>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tools</h3>
            <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700">
              <button
                onClick={() => setActiveTool(ToolMode.FILL)}
                className={`flex-1 py-2 rounded-md flex justify-center items-center gap-2 transition-all ${activeTool === ToolMode.FILL ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              >
                <Icons.Bucket /> Fill
              </button>
              <button
                onClick={() => setActiveTool(ToolMode.PAN)}
                className={`flex-1 py-2 rounded-md flex justify-center items-center gap-2 transition-all ${activeTool === ToolMode.PAN ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
              >
                <Icons.Hand /> Pan
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Settings</h3>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setToolConfig(p => ({ ...p, showNumbers: !p.showNumbers }))} className={`flex-1 py-2 text-xs rounded-md border ${toolConfig.showNumbers ? 'bg-indigo-900/30 border-indigo-500 text-indigo-300' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}># 123</button>
              <button onClick={() => setToolConfig(p => ({ ...p, showBorders: !p.showBorders }))} className={`flex-1 py-2 text-xs rounded-md border ${toolConfig.showBorders ? 'bg-indigo-900/30 border-indigo-500 text-indigo-300' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>Borders</button>
              <button onClick={() => setToolConfig(p => ({ ...p, highlightActive: !p.highlightActive }))} className={`flex-1 py-2 text-xs rounded-md border ${toolConfig.highlightActive ? 'bg-indigo-900/30 border-indigo-500 text-indigo-300' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>Highlight</button>
            </div>
          </div>

          <div className="space-y-3 pb-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Colors</h3>
            <div className="grid grid-cols-4 gap-2">
              {currentPalette.map((color) => {
                const isActive = activeColor?.id === color.id;
                const pixelsFilled = colorProgressMap.get(color.id) || 0;
                const isComplete = pixelsFilled >= color.count;
                const percentage = Math.min(100, (pixelsFilled / color.count) * 100);
                return (
                  <button
                    key={color.id}
                    onClick={() => setActiveColor(color)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center relative group overflow-hidden transition-all duration-200 ${isActive ? 'ring-2 ring-white scale-105 z-10 shadow-xl' : 'opacity-80 hover:opacity-100 hover:scale-105'}`}
                    style={{ backgroundColor: color.hex }}
                  >
                    <span className={`text-xs font-bold z-10 ${(color.rgb.r + color.rgb.g + color.rgb.b) > 400 ? 'text-black' : 'text-white'}`}>{isComplete ? <Icons.Check /> : color.id}</span>
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-black/20"><div className="h-full bg-white/80 transition-all duration-500" style={{ width: `${percentage}%` }} /></div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER (Overlay) */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-30 bg-gray-900 border-t border-gray-800 transform transition-transform duration-300 ease-out shadow-2xl rounded-t-2xl pb-safe ${activeMobileTab !== 'none' ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '60vh' }}
      >
        {/* Drawer Handle */}
        <div className="w-full flex justify-center pt-2 pb-1" onPointerDown={() => setActiveMobileTab('none')}>
          <div className="w-12 h-1.5 bg-gray-700 rounded-full"></div>
        </div>

        {/* Drawer Content */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(60vh - 20px)' }}>

          {activeMobileTab === 'colors' && (
            <div className="grid grid-cols-5 gap-3">
              {currentPalette.map((color) => {
                const isActive = activeColor?.id === color.id;
                const pixelsFilled = colorProgressMap.get(color.id) || 0;
                const isComplete = pixelsFilled >= color.count;
                const percentage = Math.min(100, (pixelsFilled / color.count) * 100);
                return (
                  <button
                    key={color.id}
                    onClick={() => { setActiveColor(color); setActiveMobileTab('none'); }}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center relative overflow-hidden ${isActive ? 'ring-2 ring-white scale-110 z-10' : 'opacity-90'}`}
                    style={{ backgroundColor: color.hex }}
                  >
                    <span className={`text-xs font-bold z-10 ${(color.rgb.r + color.rgb.g + color.rgb.b) > 400 ? 'text-black' : 'text-white'}`}>{isComplete ? <Icons.Check /> : color.id}</span>
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-black/20"><div className="h-full bg-white/80 transition-all duration-500" style={{ width: `${percentage}%` }} /></div>
                  </button>
                );
              })}
            </div>
          )}

          {activeMobileTab === 'tools' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center text-gray-300 mb-2">
                <span className="font-bold">Tools</span>
              </div>
              <div className="flex gap-4">
                <button onClick={() => { setActiveTool(ToolMode.FILL); setActiveMobileTab('none'); }} className={`flex-1 p-4 rounded-xl flex flex-col items-center gap-2 ${activeTool === ToolMode.FILL ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                  <Icons.Bucket /> <span className="font-bold">Fill</span>
                </button>
                <button onClick={() => { setActiveTool(ToolMode.PAN); setActiveMobileTab('none'); }} className={`flex-1 p-4 rounded-xl flex flex-col items-center gap-2 ${activeTool === ToolMode.PAN ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                  <Icons.Hand /> <span className="font-bold">Pan</span>
                </button>
              </div>

              <div className="h-px bg-gray-800"></div>

              <div className="flex gap-4">
                <button onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} className="flex-1 p-4 bg-gray-800 rounded-xl flex items-center justify-center gap-2 text-gray-300 font-bold active:bg-gray-700">
                  <Icons.Eye /> View Original
                </button>
                <button onClick={downloadImage} className="flex-1 p-4 bg-gray-800 rounded-xl flex items-center justify-center gap-2 text-gray-300 font-bold active:bg-gray-700">
                  <Icons.Download /> Save Image
                </button>
              </div>

              <button
                onClick={() => {
                  if (confirm("Exit? Progress lost.")) {
                    setStage(AppStage.UPLOAD);
                    setSourceImage(null);
                    setProcessedData(null);
                  }
                }}
                className="w-full p-4 bg-red-900/30 text-red-500 rounded-xl font-bold flex items-center justify-center gap-2 mt-4"
              >
                <Icons.Undo /> Exit to Menu
              </button>
            </div>
          )}

          {activeMobileTab === 'settings' && (<>
            <div className="space-y-4">
              <h3 className="text-gray-400 font-bold uppercase text-xs tracking-wider">View Settings</h3>
              <button onClick={() => setToolConfig(p => ({ ...p, showNumbers: !p.showNumbers }))} className="w-full flex justify-between items-center p-4 bg-gray-800 rounded-xl">
                <span className="text-gray-200">Show Numbers</span>
                <div className={`w-12 h-6 rounded-full transition-colors relative ${toolConfig.showNumbers ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${toolConfig.showNumbers ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
              </button>
              <button onClick={() => setToolConfig(p => ({ ...p, showBorders: !p.showBorders }))} className="w-full flex justify-between items-center p-4 bg-gray-800 rounded-xl">
                <span className="text-gray-200">Show Borders</span>
                <div className={`w-12 h-6 rounded-full transition-colors relative ${toolConfig.showBorders ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${toolConfig.showBorders ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
              </button>
              <button onClick={() => setToolConfig(p => ({ ...p, highlightActive: !p.highlightActive }))} className="w-full flex justify-between items-center p-4 bg-gray-800 rounded-xl">
                <span className="text-gray-200">Highlight Active Color</span>
                <div className={`w-12 h-6 rounded-full transition-colors relative ${toolConfig.highlightActive ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${toolConfig.highlightActive ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>

            <div className="pt-4 border-t border-gray-800">
              {user ? (
                <button onClick={handleLogout} className="w-full p-4 bg-red-900/20 text-red-400 rounded-xl font-bold">Logout</button>
              ) : (
                <button onClick={handleLogin} className="w-full p-4 bg-purple-600 text-white rounded-xl font-bold shadow-lg">Login with GitHub</button>
              )}
            </div>
          </>)}
        </div>
      </div>

      {/* MOBILE BOTTOM TAB BAR */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-gray-950/90 backdrop-blur border-t border-gray-800 pb-safe">
        <div className="flex items-center justify-around h-16">
          <button
            onClick={() => toggleMobileTab('colors')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeMobileTab === 'colors' ? 'text-indigo-400' : 'text-gray-500'}`}
          >
            <div className="w-6 h-6 rounded-full border-2 border-current" style={{ backgroundColor: activeColor?.hex || 'transparent' }}></div>
            <span className="text-xs font-bold">Palette</span>
          </button>
          <button
            onClick={() => toggleMobileTab('tools')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeMobileTab === 'tools' ? 'text-indigo-400' : 'text-gray-500'}`}
          >
            <Icons.Bucket />
            <span className="text-xs font-bold">Tools</span>
          </button>
          <button
            onClick={() => toggleMobileTab('settings')}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeMobileTab === 'settings' ? 'text-indigo-400' : 'text-gray-500'}`}
          >
            <Icons.Wand />
            <span className="text-xs font-bold">Options</span>
          </button>
        </div>
      </div>



      <main className="flex-1 bg-gray-800 relative shadow-inner overflow-hidden flex flex-col items-center justify-center pb-16 md:pb-0">
        {processedData && (
          <ColoringCanvas
            data={processedData}
            palette={currentPalette}
            activeColor={activeColor}
            config={toolConfig}
            activeTool={activeTool}
            filledRegions={filledRegions}
            onFillRegion={(id) => {
              const next = new Set(filledRegions);
              next.add(id);
              setFilledRegions(next);
            }}
            showOriginal={showOriginal}
            originalImageSrc={sourceImage}
            onToast={addToast}
          />
        )}
      </main>
    </div>
  );
};

export default App;