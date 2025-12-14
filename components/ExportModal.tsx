import React, { useState } from 'react';
import { ProcessedImage, PaletteColor, PaletteTheme, ToolConfig, SessionData } from '../types';
import { saveLastSession } from '../utils/storage';
import { applyTheme } from '../utils/colorThemes';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    processedData: ProcessedImage;
    palette: PaletteColor[];
    filledRegions: Set<number>;
    sourceImage: string;
    activeTheme: PaletteTheme;
    toolConfig: ToolConfig;
    onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const ExportModal: React.FC<ExportModalProps> = ({
    isOpen, onClose, processedData, palette, filledRegions, sourceImage, activeTheme, toolConfig, onToast
}) => {
    const [activeTab, setActiveTab] = useState<'cache' | 'files'>('cache');
    const [artistName, setArtistName] = useState('Artist');
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    // Helper to generate SessionData
    const createSessionData = (): SessionData => ({
        version: 1,
        artistName,
        timestamp: Date.now(),
        sourceImage,
        processedData,
        filledRegions: Array.from(filledRegions),
        activeTheme,
        toolConfig
    });

    const handleSmartSave = async () => {
        setIsSaving(true);
        try {
            const data = createSessionData();
            await saveLastSession(data);
            onToast("Progress saved to browser cache!", 'success');
            onClose(); // Optional: Close on success? Or keep open? User preference usually close.
        } catch (e) {
            console.error(e);
            onToast("Failed to save to cache.", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportFile = () => {
        const data = createSessionData();
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `chroma-session-${Date.now()}.chroma`; // Custom extension or .json
        link.click();
        URL.revokeObjectURL(url);
        onToast("Project file downloaded.", 'success');
    };

    const generateImage = (type: 'worksheet' | 'art' | 'key') => {
        const canvas = document.createElement('canvas');
        const w = processedData.originalWidth;
        const h = processedData.originalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Sizing depends on type
        if (type === 'key') {
            canvas.width = 600;
            canvas.height = Math.max(800, palette.length * 50 + 100);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#000';
            ctx.font = 'bold 30px sans-serif';
            ctx.fillText(`Color Key`, 40, 50);

            palette.forEach((c, i) => {
                const y = 100 + i * 50;
                ctx.fillStyle = c.hex;
                ctx.fillRect(40, y - 30, 40, 40);
                ctx.strokeRect(40, y - 30, 40, 40);
                ctx.fillStyle = '#000';
                ctx.font = '20px sans-serif';
                ctx.fillText(`#${c.id} - ${c.hex.toUpperCase()}`, 100, y);
            });

        } else {
            // Worksheet or Art
            canvas.width = w;
            canvas.height = h;

            ctx.fillStyle = '#FFF';
            ctx.fillRect(0, 0, w, h);

            const imgData = ctx.createImageData(w, h);
            const buf = new Uint32Array(imgData.data.buffer);
            buf.fill(0xFFFFFFFF);

            if (type === 'art') {
                // Draw filled regions
                processedData.regions.forEach(region => {
                    const isFilled = filledRegions.has(region.id);
                    // For Art Print, we might want to fill EVERYTHING or just what is filled? 
                    // User said "Before/After" image. 
                    // Let's assume this is the "After" (Current Progress)
                    if (isFilled) {
                        const c = palette[region.colorId].rgb;
                        const val = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
                        for (const p of region.pixels) buf[p] = val;
                    }
                });
                ctx.putImageData(imgData, 0, 0);
            } else {
                // Worksheet: Borders + Numbers
                ctx.putImageData(imgData, 0, 0); // White bg

                ctx.fillStyle = '#cfcfcf'; // Light grey borders
                processedData.regions.forEach(region => {
                    for (const p of region.borderPixels) {
                        ctx.fillRect(p % w, Math.floor(p / w), 1, 1);
                    }
                    const fontSize = Math.max(10, Math.floor(w / 120));
                    if (region.pixels.length > fontSize * fontSize) {
                        ctx.fillStyle = '#9ca3af';
                        ctx.font = `bold ${fontSize}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText(palette[region.colorId].id.toString(), region.centroid.x, region.centroid.y);
                    }
                    ctx.fillStyle = '#cfcfcf'; // Reset for next border
                });
            }
        }

        const link = document.createElement('a');
        link.download = `chroma-${type}-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        onToast(`${type.charAt(0).toUpperCase() + type.slice(1)} downloaded.`, 'success');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-gray-900 w-full max-w-2xl rounded-2xl border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                    <h2 className="text-2xl font-bold text-white">Save & Export</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex border-b border-gray-800">
                    <button
                        onClick={() => setActiveTab('cache')}
                        className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'cache' ? 'bg-gray-800 text-indigo-400 border-b-2 border-indigo-500' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}
                    >
                        Smart Save
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'files' ? 'bg-gray-800 text-indigo-400 border-b-2 border-indigo-500' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}
                    >
                        Dual Save (Files)
                    </button>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                    {activeTab === 'cache' ? (
                        <div className="space-y-6 text-center">
                            <div className="bg-indigo-900/20 p-6 rounded-xl border border-indigo-500/30">
                                <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-900/50">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Save to Browser Cache</h3>
                                <p className="text-gray-400 text-sm">Instantly save your progress here. Perfect for taking a break and coming back later on this device.</p>
                            </div>

                            <div className="max-w-xs mx-auto">
                                <label className="block text-left text-xs font-bold text-gray-500 uppercase mb-1">Artist Name (Optional)</label>
                                <input
                                    type="text"
                                    value={artistName}
                                    onChange={(e) => setArtistName(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            <button
                                onClick={handleSmartSave}
                                disabled={isSaving}
                                className="w-full max-w-sm mx-auto py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-xl transition-transform active:scale-95 disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save Progress Now'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <p className="text-center text-gray-400 text-sm mb-6">Download your files to keep them forever or print them out.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button onClick={handleExportFile} className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-left transition-colors group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4 4m4 4V4" /></svg></div>
                                        <span className="font-bold text-white">Project File</span>
                                    </div>
                                    <p className="text-xs text-gray-500">Full backup (.chroma). Upload this later to restore everything.</p>
                                </button>

                                <button onClick={() => generateImage('worksheet')} className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-left transition-colors group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-green-500/20 text-green-400 rounded-lg group-hover:bg-green-500 group-hover:text-white transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                                        <span className="font-bold text-white">Worksheet</span>
                                    </div>
                                    <p className="text-xs text-gray-500">Blank image with numbers. Great for printing.</p>
                                </button>

                                <button onClick={() => generateImage('art')} className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-left transition-colors group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg group-hover:bg-purple-500 group-hover:text-white transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                                        <span className="font-bold text-white">Art Print</span>
                                    </div>
                                    <p className="text-xs text-gray-500">Current progress image without numbers.</p>
                                </button>

                                <button onClick={() => generateImage('key')} className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-left transition-colors group">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-yellow-500/20 text-yellow-400 rounded-lg group-hover:bg-yellow-500 group-hover:text-white transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></div>
                                        <span className="font-bold text-white">Palette Key</span>
                                    </div>
                                    <p className="text-xs text-gray-500">List of colors and their ID numbers.</p>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExportModal;
