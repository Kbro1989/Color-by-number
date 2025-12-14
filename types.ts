export enum AppStage {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  COLORING = 'COLORING',
}

export enum PaletteTheme {
  STANDARD = 'STANDARD',
  CHROMATIC = 'CHROMATIC',
  PRISMATIC = 'PRISMATIC',
  CHALK = 'CHALK',
  MARKER = 'MARKER',
}

export enum ToolMode {
  FILL = 'FILL',
  PAN = 'PAN',
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface PaletteColor {
  id: number;
  rgb: RGB;
  hex: string;
  textColor: string; // 'black' or 'white' based on luminance
  count: number; // Number of pixels/regions with this color
}

export interface Region {
  id: number;
  colorId: number;
  pixels: number[]; // Flat indices of pixels in this region
  centroid: { x: number; y: number }; // Where to place the number
  borderPixels: number[]; // Flat indices of border pixels
}

export interface ProcessedImage {
  originalWidth: number;
  originalHeight: number;
  regions: Region[];
  palette: PaletteColor[]; // The base palette
  pixelData: Uint8ClampedArray; // The quantized image data
  regionMap: Int32Array; // Map pixel index to region ID
}

export interface ToolConfig {
  brushSize: number;
  showNumbers: boolean;
  showBorders: boolean;
  smartFill: boolean; // If true, filling a pixel fills the whole region
  highlightActive: boolean; // Highlights unfilled regions of active color
}

export interface SessionData {
  version: number;
  artistName: string;
  timestamp: number;
  sourceImage: string; // Base64
  processedData: ProcessedImage;
  filledRegions: number[]; // Array of IDs (serialized Set)
  activeTheme: PaletteTheme;
  toolConfig: ToolConfig;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

export const AI_STYLES = [
  { label: 'Standard', value: '' },
  { label: 'Stained Glass', value: 'in the style of stained glass, bold thick lines, vibrant colors' },
  { label: 'Pixel Art', value: 'pixel art style, 8-bit, retro game aesthetic' },
  { label: 'Watercolor', value: 'watercolor painting style, soft edges, artistic' },
  { label: 'Comic Book', value: 'comic book style, cel shaded, bold outlines' },
  { label: 'Oil Painting', value: 'impasto oil painting style, textured strokes' },
  { label: 'Psychedelic', value: 'psychedelic colors, swirling patterns, trippy' },
];