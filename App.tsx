import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createClient } from "@openauthjs/openauth/client";
import { AppStage, ProcessedImage, PaletteColor, ToolConfig, PaletteTheme, ToolMode, ToastMessage, AI_STYLES, SessionData } from './types';
import { processImageForColoring } from './services/imageProcessor';
import { remixImage, generateImageFromPrompt } from './services/geminiService';
import { applyTheme } from './utils/colorThemes';
import { saveLastSession, loadLastSession, clearSession } from './utils/storage';
import ColoringCanvas from './components/ColoringCanvas';
import ToastContainer from './components/ToastContainer';
import ExportModal from './components/ExportModal';
import { db } from './src/services/instantDb';

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
  Check: () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>,
  Save: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
};

const authClient = createClient({
  clientID: import.meta.env.VITE_AUTH_CLIENT_ID || "pog-auth-client",
  issuer: import.meta.env.VITE_AUTH_ISSUER || "https://openauth-template.kristain33rs.workers.dev",
});

const App: React.FC = () => {
  const [stage, setStage] = useState<AppStage>(AppStage.UPLOAD);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [resumeSession, setResumeSession] = useState<SessionData | null>(null);

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

  // InstantDB Auth
  const { isLoading: authLoading, user: instantUser, error: authError } = db.useAuth();
  const [user, setUser] = useState<any>(null);

  // Canvas State (Lifted from ColoringCanvas)
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });

  const centerImage = () => {
    if (processedData) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scaleX = w / processedData.originalWidth;
      const scaleY = h / processedData.originalHeight;
      const startScale = Math.min(scaleX, scaleY, 1) * 0.9;
      setCanvasScale(startScale);
      setCanvasOffset({
        x: (w - processedData.originalWidth * startScale) / 2,
        y: (h - processedData.originalHeight * startScale) / 2
      });
    }
  };

  // Center when data loads
  useEffect(() => {
    if (processedData) centerImage();
  }, [processedData]);

  // Check for saved session on mount
  useEffect(() => {
    const checkSession = async () => {
      const saved = await loadLastSession();
      if (saved) {
        setResumeSession(saved);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const token = new URLSearchParams(window.location.search).get("code");
      if (token) {
        try {
          const code = new URLSearchParams(window.location.search).get("code");
          if (!code) throw new Error("No code found");
          const exchanged = await authClient.exchange(code, window.location.origin);
          if (exchanged.err) throw exchanged.err;
          if ('tokens' in exchanged) {
            localStorage.setItem("access_token", exchanged.tokens.access);
          }
          window.history.replaceState({}, "", "/");
        } catch (e) {
          console.error(e);
        }
      }

      const savedToken = localStorage.getItem("access_token");
      if (savedToken) {
        try {
          const parts = savedToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            setUser({ id: payload.sub });
          } else {
            throw new Error("Invalid token format");
          }
        } catch (e) {
          console.warn("Invalid token found, clearing session", e);
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
    db.auth.signOut();
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

  const restoreSession = (data: SessionData) => {
    setSourceImage(data.sourceImage);
    setProcessedData(data.processedData);
    setFilledRegions(new Set(data.filledRegions));
    setActiveTheme(data.activeTheme);
    setToolConfig(data.toolConfig);

    // Setup Initial State
    if (data.processedData.palette.length > 0) {
      const palette = applyTheme(data.processedData.palette, data.activeTheme);
      setActiveColor(palette[0]);
    }

    setStage(AppStage.COLORING);
    setResumeSession(null);
    addToast(`Resumed session by ${data.artistName}`, 'success');
  };

  const loadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target?.result as string);
          if (json.version && json.processedData) {
            restoreSession(json as SessionData);
          } else {
            addToast("Invalid session file.", 'error');
          }
        } catch (e) {
          addToast("Could not parse file.", 'error');
        }
      };
      reader.readAsText(e.target.files[0]);
    }
  };

  // Computed Values
  const regionsMap = useMemo(() => {
    const map = new Map();
    if (processedData) {
      processedData.regions.forEach(r => map.set(r.id, r));
    }
    return map;
  }, [processedData]);

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
      const region = regionsMap.get(rId);
      if (region) {
        const cId = processedData.palette[region.colorId].id;
        map.set(cId, (map.get(cId) || 0) + region.pixels.length);
      }
    });
    return map;
  }, [filledRegions, processedData, regionsMap]);

  const totalPixels = useMemo(() => processedData ? processedData.originalWidth * processedData.originalHeight : 1, [processedData]);
  const progress = useMemo(() => {
    if (!processedData) return 0;
    let filledPixels = 0;
    filledRegions.forEach(rId => {
      const region = regionsMap.get(rId);
      if (region) filledPixels += region.pixels.length;
    });
    return (filledPixels / totalPixels) * 100;
  }, [filledRegions, processedData, totalPixels, regionsMap]);

  // Completion Check
  useEffect(() => {
    if (progress > 99.9 && !showCelebration && stage === AppStage.COLORING) {
      setShowCelebration(true);
      addToast("Masterpiece Complete! 🎉", 'success');
    }
  }, [progress, stage]);

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

  const onFillRegion = (regionId: number) => {
    if (!filledRegions.has(regionId) && activeColor) {
      setFilledRegions(prev => {
        const next = new Set(prev);
        next.add(regionId);
        return next;
      });
    }
  };

  if (stage === AppStage.UPLOAD) {
    return (
      <div className="fixed inset-0 bg-gray-950 text-gray-100 overflow-y-auto custom-scrollbar">
        <div className="min-h-full w-full flex flex-col items-center justify-center p-4 pb-48 md:pb-4">
          <ToastContainer toasts={toasts} removeToast={removeToast} />

          {/* Resume Prompt */}
          {resumeSession && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
              <div className="bg-indigo-900 border border-indigo-500 rounded-xl p-4 shadow-2xl flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
                  <Icons.Save />
                </div>
                <div>
                  <h4 className="font-bold text-white">Resume previous session?</h4>
                  <p className="text-xs text-indigo-300">By {resumeSession.artistName} • {new Date(resumeSession.timestamp).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => restoreSession(resumeSession)} className="px-4 py-2 bg-white text-indigo-900 font-bold rounded-lg text-sm">Resume</button>
                  <button onClick={async () => { await clearSession(); setResumeSession(null); }} className="px-4 py-2 bg-indigo-800/50 hover:bg-indigo-800 text-indigo-200 rounded-lg text-sm">Discard</button>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-xl w-full space-y-8 py-8">
            <div className="text-center">
              <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 mb-4">
                ChromaNumber
              </h1>
              <p className="text-gray-400 text-lg">AI-Powered Precision Coloring</p>

              <div className="flex justify-center pt-4">
                {user ? (
                  <div className="flex items-center gap-4 bg-gray-900 rounded-full px-6 py-2 border border-gray-800">
                    <span className="text-green-400 font-bold text-sm">● Logged In</span>
                    <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white underline">Logout</button>
                  </div>
                ) : (
                  <button onClick={handleLogin} className="px-6 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/50 rounded-full text-sm font-bold transition-all">
                    Login to Save Progress
                  </button>
                )}
              </div>
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
                          {isGenerating ? 'Fluxing Masterpiece...' : <><Icons.Wand /> Generate Image</>}
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
                            }}
                            className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold transition-colors"
                          >
                            Use This Image
                          </button>
                          <button
                            onClick={() => setGeneratedPreview(null)}
                            className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold transition-colors"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {/* Add Load File Button below Generate */}
              <div className="flex items-center gap-4 py-2">
                <div className="h-px flex-1 bg-gray-800"></div>
                <span className="text-gray-500 text-xs font-bold tracking-wider">OR LOAD SESSION</span>
                <div className="h-px flex-1 bg-gray-800"></div>
              </div>

              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 flex flex-col items-center text-center">
                <label className="cursor-pointer">
                  <input type="file" accept=".json,.chroma" onChange={loadFromFile} className="hidden" />
                  <div className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-gray-300 flex items-center gap-2 transition-colors">
                    <Icons.Upload />
                    Load .chroma File
                  </div>
                </label>
                <p className="mt-2 text-xs text-gray-500">Restore a previously downloaded session file.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-gray-950 overflow-hidden text-gray-200 font-sans relative">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Export Modal */}
      {processedData && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          processedData={processedData}
          palette={currentPalette}
          filledRegions={filledRegions}
          sourceImage={sourceImage!}
          activeTheme={activeTheme}
          toolConfig={toolConfig}
          onToast={addToast}
        />
      )}

      {/* Celebration Modal */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => setShowCelebration(false)}>
          <div className="bg-gray-900 p-8 rounded-2xl border-2 border-purple-500 shadow-2xl text-center space-y-4 max-w-sm m-4 transform animate-bounce-in" onClick={e => e.stopPropagation()}>
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
              Masterpiece!
            </h2>
            <p className="text-gray-300">You've colored all {processedData?.regions.length} regions!</p>
            <button
              onClick={() => { setShowCelebration(false); setShowExportModal(true); }}
              className="px-8 py-3 bg-purple-600 hover:bg-purple-500 rounded-full font-bold shadow-lg shadow-purple-900/50 transition-transform hover:scale-105"
            >
              Save & Share
            </button>
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-80 h-full bg-gray-900 border-r border-gray-800 flex-col shrink-0 z-20 shadow-2xl">
        <div className="p-6 border-b border-gray-800 bg-gray-950/50 backdrop-blur">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg flex items-center justify-center text-white font-bold text-xl">
              CN
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight text-white">ChromaNumber</h2>
              <span className="text-xs text-indigo-400 font-medium">AI Edition</span>
            </div>
          </div>

          {user && (
            <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3 border border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs font-bold text-gray-400">{user.email || 'Logged In'}</span>
              </div>
              <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300">Exit</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {/* Tools & Options */}
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-3 border border-gray-700 space-y-3">
              <div className="flex gap-2 bg-gray-900 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTool(ToolMode.FILL)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-bold text-xs uppercase tracking-wide transition-all ${activeTool === ToolMode.FILL ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <Icons.Bucket /> Fill
                </button>
                <button
                  onClick={() => setActiveTool(ToolMode.PAN)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-bold text-xs uppercase tracking-wide transition-all ${activeTool === ToolMode.PAN ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <Icons.Hand /> Pan
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase flex justify-between">
                  <span>Brush Size</span>
                  <span>{toolConfig.brushSize}x</span>
                </label>
                <input
                  type="range" min="1" max="5"
                  value={toolConfig.brushSize}
                  onChange={(e) => setToolConfig(prev => ({ ...prev, brushSize: parseInt(e.target.value) }))}
                  className="w-full h-1.5 bg-gray-900 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setToolConfig(prev => ({ ...prev, smartFill: !prev.smartFill }))}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-bold transition-all ${toolConfig.smartFill ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-300' : 'bg-gray-900 border-transparent text-gray-500 hover:border-gray-700'}`}
                >
                  <div className={`w-3 h-3 rounded-full border ${toolConfig.smartFill ? 'bg-indigo-500 border-indigo-500' : 'border-gray-500'}`} />
                  Smart Fill
                </button>
                <button
                  onClick={() => setToolConfig(prev => ({ ...prev, highlightActive: !prev.highlightActive }))}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-bold transition-all ${toolConfig.highlightActive ? 'bg-yellow-900/30 border-yellow-500/50 text-yellow-300' : 'bg-gray-900 border-transparent text-gray-500 hover:border-gray-700'}`}
                >
                  <div className={`w-3 h-3 rounded-full border ${toolConfig.highlightActive ? 'bg-yellow-500 border-yellow-500' : 'border-gray-500'}`} />
                  Highlight
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setToolConfig(prev => ({ ...prev, showNumbers: !prev.showNumbers }))}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-bold transition-all ${toolConfig.showNumbers ? 'bg-gray-700 border-gray-500 text-gray-200' : 'bg-gray-900 border-transparent text-gray-600'}`}
                >
                  <span className="text-[10px]">123</span> Numbers
                </button>
                <button
                  onClick={() => setToolConfig(prev => ({ ...prev, showBorders: !prev.showBorders }))}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-bold transition-all ${toolConfig.showBorders ? 'bg-gray-700 border-gray-500 text-gray-200' : 'bg-gray-900 border-transparent text-gray-600'}`}
                >
                  <span className="text-[10px]">⬜</span> Borders
                </button>
              </div>

              {/* Theme Selector (Restored) */}
              <div className="space-y-1 pt-2 border-t border-gray-700">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Color Theme</label>
                <select
                  value={activeTheme}
                  onChange={(e) => setActiveTheme(e.target.value as PaletteTheme)}
                  className="w-full bg-gray-900 text-xs border border-gray-700 rounded-lg p-2 font-medium text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  {Object.values(PaletteTheme).map(theme => (
                    <option key={theme} value={theme}>
                      {theme.charAt(0) + theme.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onPointerDown={() => setShowOriginal(true)}
              onPointerUp={() => setShowOriginal(false)}
              onPointerLeave={() => setShowOriginal(false)}
              className="flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-all active:scale-95"
            >
              <Icons.Eye /> <span>View</span>
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-all active:scale-95"
            >
              <Icons.Save /> <span>Save</span>
            </button>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-medium text-gray-400">
              <span>Progress</span>
              <span className="text-indigo-400">{Math.round(progress)}%</span>
            </div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500 text-right">{filledRegions.size} / {processedData?.regions.length} regions</p>
          </div>

          {/* Palette */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Color Palette</h3>
            <div className="space-y-1">
              {currentPalette.map((color) => {
                const isCompleted = colorProgressMap.get(color.id) === processedData?.regions.filter(r => processedData.palette[r.colorId].id === color.id).reduce((acc, r) => acc + r.pixels.length, 0);
                const isActive = activeColor?.id === color.id;

                return (
                  <button
                    key={color.id}
                    onClick={() => setActiveColor(color)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all border ${isActive
                      ? 'bg-indigo-900/30 border-indigo-500/50 shadow-lg shadow-indigo-900/20 translate-x-1'
                      : 'bg-transparent border-transparent hover:bg-gray-800 hover:border-gray-700'
                      }`}
                  >
                    <div
                      className="w-8 h-8 rounded-full shadow-sm border border-white/10 flex items-center justify-center relative"
                      style={{ backgroundColor: color.hex }}
                    >
                      <span className={`text-[10px] font-bold ${[0, 0, 0].reduce((a, c, i) => a + (parseInt(color.hex.slice(1 + i * 2, 3 + i * 2), 16) * [0.299, 0.587, 0.114][i]), 0) > 128 ? 'text-black' : 'text-white'}`}>
                        {color.id}
                      </span>
                      {isCompleted && (
                        <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 border border-gray-900">
                          <Icons.Check />
                        </div>
                      )}
                    </div>
                    <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-400'} ${isCompleted ? 'line-through opacity-50' : ''}`}>
                      {color.originalName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 relative bg-[#0a0a0c] overflow-hidden flex flex-col items-center justify-center">
        {processedData && (
          <ColoringCanvas
            data={processedData}
            palette={currentPalette}
            activeColor={activeColor!}
            config={toolConfig}
            activeTool={activeTool}
            filledRegions={filledRegions}
            onFillRegion={onFillRegion}
            showOriginal={showOriginal}
            originalImageSrc={sourceImage}
            onToast={addToast}
            scale={canvasScale}
            offset={canvasOffset}
            onZoom={setCanvasScale}
            onPan={(x, y) => setCanvasOffset({ x, y })}
          />
        )}
      </main>

      {/* MOBILE DRAWER */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-30 transition-transform duration-300 ease-in-out ${activeMobileTab !== 'none' ? 'translate-y-0' : 'translate-y-[calc(100%-80px)]'}`}>

        {/* Tab Bar */}
        <div className="flex h-20 items-center justify-around px-2 border-b border-gray-800 bg-gray-900 relative z-40">
          <button
            onClick={() => toggleMobileTab('colors')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${activeMobileTab === 'colors' ? 'text-indigo-400' : 'text-gray-500'}`}
          >
            <div className="w-8 h-8 rounded-full border-2 border-current p-0.5">
              <div className="w-full h-full rounded-full" style={{ backgroundColor: activeColor?.hex || '#ccc' }} />
            </div>
            <span className="text-[10px] font-bold">Colors</span>
          </button>

          <div className="flex items-center gap-1 bg-gray-800 rounded-full p-1 border border-gray-700">
            <button
              onClick={() => setActiveTool(ToolMode.FILL)}
              className={`p-3 rounded-full transition-all ${activeTool === ToolMode.FILL ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <Icons.Bucket />
            </button>
            <button
              onClick={() => setActiveTool(ToolMode.PAN)}
              className={`p-3 rounded-full transition-all ${activeTool === ToolMode.PAN ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <Icons.Hand />
            </button>
          </div>

          <button
            onClick={() => toggleMobileTab('tools')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${activeMobileTab === 'tools' ? 'text-indigo-400' : 'text-gray-500'}`}
          >
            <Icons.Bulb />
            <span className="text-[10px] font-bold">Tools</span>
          </button>
        </div>

        {/* Mobile Content Panels */}
        <div className="h-64 bg-gray-900 overflow-y-auto custom-scrollbar p-4">
          {activeMobileTab === 'colors' && (
            <div className="grid grid-cols-4 gap-3">
              {currentPalette.map(c => (
                <button
                  key={c.id}
                  onClick={() => setActiveColor(c)}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-all ${activeColor?.id === c.id ? 'border-indigo-500 bg-indigo-900/20' : 'border-transparent bg-gray-800'}`}
                >
                  <div className="w-8 h-8 rounded-full shadow-sm" style={{ backgroundColor: c.hex }} />
                  <span className="text-xs font-bold text-gray-400">{c.id}</span>
                </button>
              ))}
            </div>
          )}

          {activeMobileTab === 'tools' && (
            <div className="space-y-6 pb-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Brush</label>
                  <input
                    type="range" min="1" max="5"
                    value={toolConfig.brushSize}
                    onChange={(e) => setToolConfig(prev => ({ ...prev, brushSize: parseInt(e.target.value) }))}
                    className="w-full accent-indigo-500 h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-2 justify-end">
                  {/* Smart Fill */}
                  <button
                    onClick={() => setToolConfig(p => ({ ...p, smartFill: !p.smartFill }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${toolConfig.smartFill ? 'bg-indigo-900/30 border-indigo-500 text-indigo-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                  >
                    <div className={`w-3 h-3 rounded-full border ${toolConfig.smartFill ? 'bg-indigo-500 border-indigo-500' : 'border-gray-500'}`} />
                    Smart Fill
                  </button>
                  {/* Highlight */}
                  <button
                    onClick={() => setToolConfig(p => ({ ...p, highlightActive: !p.highlightActive }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${toolConfig.highlightActive ? 'bg-yellow-900/30 border-yellow-500 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                  >
                    <div className={`w-3 h-3 rounded-full border ${toolConfig.highlightActive ? 'bg-yellow-500 border-yellow-500' : 'border-gray-500'}`} />
                    Highlight
                  </button>
                </div>
              </div>

              {/* Display Toggles */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setToolConfig(p => ({ ...p, showNumbers: !p.showNumbers }))}
                  className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${toolConfig.showNumbers ? 'bg-indigo-900/20 border-indigo-500/50 text-indigo-300' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                >
                  <span>123</span> Numbers
                </button>
                <button
                  onClick={() => setToolConfig(p => ({ ...p, showBorders: !p.showBorders }))}
                  className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${toolConfig.showBorders ? 'bg-indigo-900/20 border-indigo-500/50 text-indigo-300' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                >
                  <span>⬜</span> Borders
                </button>
              </div>

              {/* Theme Selector (Mobile) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Color Theme</label>
                <select
                  value={activeTheme}
                  onChange={(e) => setActiveTheme(e.target.value as PaletteTheme)}
                  className="w-full bg-gray-800 text-sm border border-gray-700 rounded-lg p-3 font-medium text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  {Object.values(PaletteTheme).map(theme => (
                    <option key={theme} value={theme}>
                      {theme.charAt(0) + theme.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onPointerDown={() => setShowOriginal(true)}
                  onPointerUp={() => setShowOriginal(false)}
                  className="p-4 bg-gray-800 rounded-xl flex items-center justify-center gap-2 text-gray-300 font-bold active:bg-gray-700"
                >
                  <Icons.Eye /> View Orig
                </button>

                <button
                  onClick={() => setShowExportModal(true)}
                  className="p-4 bg-gray-800 rounded-xl flex items-center justify-center gap-2 text-gray-300 font-bold active:bg-gray-700"
                >
                  <Icons.Save /> Save
                </button>
              </div>

              <button onClick={() => setStage(AppStage.UPLOAD)} className="w-full py-4 bg-red-900/20 hover:bg-red-900/40 text-red-400 font-bold rounded-xl border border-red-900/50">
                Exit to Home
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default App;