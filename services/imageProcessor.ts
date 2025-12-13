import { PaletteColor, ProcessedImage, Region, RGB } from '../types';

// Helper: RGB to Hex
const rgbToHex = (r: number, g: number, b: number) =>
  "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

// Helper: Calculate Luminance for text contrast
const getContrastColor = (r: number, g: number, b: number): string => {
  // YIQ formula
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#000000' : '#ffffff';
};

// Helper: Color Distance (Squared Euclidean)
const colorDistSq = (c1: RGB, c2: RGB) => 
  (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;

/**
 * Main function to process image data into color-by-number regions.
 * Uses K-Means clustering and Flood Fill region detection with small-region merging.
 */
export const processImageForColoring = async (
  imageData: ImageData,
  maxColors: number = 48 // Increased default for higher fidelity
): Promise<ProcessedImage> => {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const pixelCount = width * height;

  // 1. Quantization (K-Means)
  let centroids: RGB[] = [];
  
  // Smart Initialization: Try to pick pixels that are somewhat different
  // First random
  let rIdx = Math.floor(Math.random() * pixelCount) * 4;
  centroids.push({ r: data[rIdx], g: data[rIdx+1], b: data[rIdx+2] });
  
  // Pick remaining by random sampling (simple but effective enough for this scale)
  for (let i = 1; i < maxColors; i++) {
    rIdx = Math.floor(Math.random() * pixelCount) * 4;
    centroids.push({ r: data[rIdx], g: data[rIdx + 1], b: data[rIdx + 2] });
  }

  const assignments = new Int8Array(pixelCount); 
  const iterations = 10; // More iterations for better convergence

  for (let iter = 0; iter < iterations; iter++) {
    const sums = new Float64Array(maxColors * 3);
    const counts = new Int32Array(maxColors);

    for (let i = 0; i < pixelCount; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      
      let minDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < maxColors; c++) {
        const d = (r - centroids[c].r) ** 2 + (g - centroids[c].g) ** 2 + (b - centroids[c].b) ** 2;
        if (d < minDist) {
          minDist = d;
          bestCluster = c;
        }
      }
      assignments[i] = bestCluster;
      sums[bestCluster * 3] += r;
      sums[bestCluster * 3 + 1] += g;
      sums[bestCluster * 3 + 2] += b;
      counts[bestCluster]++;
    }

    let changed = false;
    for (let c = 0; c < maxColors; c++) {
      if (counts[c] > 0) {
        const nr = Math.round(sums[c * 3] / counts[c]);
        const ng = Math.round(sums[c * 3 + 1] / counts[c]);
        const nb = Math.round(sums[c * 3 + 2] / counts[c]);
        if (nr !== centroids[c].r || ng !== centroids[c].g || nb !== centroids[c].b) {
            centroids[c] = { r: nr, g: ng, b: nb };
            changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Filter out unused centroids
  const uniqueIndices = Array.from(new Set(assignments)).sort((a, b) => a - b);
  const tempPalette: PaletteColor[] = uniqueIndices.map((oldIdx, newIdx) => ({
    id: newIdx + 1, 
    rgb: centroids[oldIdx],
    hex: rgbToHex(centroids[oldIdx].r, centroids[oldIdx].g, centroids[oldIdx].b),
    textColor: getContrastColor(centroids[oldIdx].r, centroids[oldIdx].g, centroids[oldIdx].b),
    count: 0
  }));

  const remappedAssignments = new Int8Array(pixelCount);
  for(let i=0; i<pixelCount; i++) {
      remappedAssignments[i] = uniqueIndices.indexOf(assignments[i]);
  }

  // 2. Region Extraction (Connected Components)
  const regionMap = new Int32Array(pixelCount).fill(-1);
  const regions: Region[] = [];
  const visited = new Uint8Array(pixelCount);

  let currentRegionId = 0;
  const stack = new Int32Array(pixelCount); 

  for (let i = 0; i < pixelCount; i++) {
    if (visited[i]) continue;

    const colorIdx = remappedAssignments[i];
    let stackPtr = 0;
    stack[stackPtr++] = i;
    visited[i] = 1;
    
    const regionPixels: number[] = [];
    
    while (stackPtr > 0) {
      const pIdx = stack[--stackPtr];
      regionMap[pIdx] = currentRegionId;
      regionPixels.push(pIdx);
      
      const px = pIdx % width;
      const neighbors = [
          pIdx - width, 
          pIdx + width, 
          (px > 0) ? pIdx - 1 : -1, 
          (px < width - 1) ? pIdx + 1 : -1 
      ];

      for (const nIdx of neighbors) {
        if (nIdx >= 0 && nIdx < pixelCount && !visited[nIdx] && remappedAssignments[nIdx] === colorIdx) {
          visited[nIdx] = 1;
          stack[stackPtr++] = nIdx;
        }
      }
    }

    regions.push({
        id: currentRegionId,
        colorId: colorIdx,
        pixels: regionPixels,
        centroid: { x: 0, y: 0 },
        borderPixels: []
    });
    currentRegionId++;
  }

  // 3. Clean up: Merge Small Regions
  // To handle "every slight change", we keep the threshold low.
  // A 5x5 area is 25 pixels.
  const dynamicMinSize = Math.max(20, Math.floor(pixelCount / 40000)); 
  
  const regionObjMap = new Map<number, Region>();
  regions.forEach(r => regionObjMap.set(r.id, r));
  const activeRegions = new Set(regions.map(r => r.id));

  // Sort by size to merge smallest first
  const sortedRegionIds = Array.from(activeRegions).sort((a, b) => {
      return (regionObjMap.get(a)?.pixels.length || 0) - (regionObjMap.get(b)?.pixels.length || 0);
  });

  for (const rId of sortedRegionIds) {
      const region = regionObjMap.get(rId);
      if (!region) continue;
      
      if (region.pixels.length >= dynamicMinSize) continue; 

      // Find neighbors
      const neighbors = new Set<number>();
      for (const pIdx of region.pixels) {
          const px = pIdx % width;
          const adjs = [pIdx - width, pIdx + width, (px>0?pIdx-1:-1), (px<width-1?pIdx+1:-1)];
          for(const adj of adjs) {
              if(adj >= 0 && adj < pixelCount) {
                  const neighborId = regionMap[adj];
                  if(neighborId !== region.id && activeRegions.has(neighborId)) {
                      neighbors.add(neighborId);
                  }
              }
          }
      }

      // Find best neighbor: Prioritize color similarity to preserve edges
      let bestNeighbor = -1;
      let minColorDiff = Infinity;
      let largestBorderNeighbor = -1;
      let maxBorder = -1; // Fallback

      for (const nid of neighbors) {
          const neighbor = regionObjMap.get(nid)!;
          
          // Color diff
          const c1 = tempPalette[region.colorId].rgb;
          const c2 = tempPalette[neighbor.colorId].rgb;
          const diff = colorDistSq(c1, c2);

          if (diff < minColorDiff) {
              minColorDiff = diff;
              bestNeighbor = nid;
          }
          
          // Fallback logic could go here if colors are identical (unlikely with float centroids but possible)
      }

      // If no valid color neighbor found (isolated?), skip
      if (bestNeighbor !== -1) {
          const target = regionObjMap.get(bestNeighbor)!;
          // Merge
          for(const p of region.pixels) {
              regionMap[p] = bestNeighbor;
              target.pixels.push(p);
          }
          activeRegions.delete(region.id);
      }
  }

  const finalRegions = Array.from(activeRegions).map(id => regionObjMap.get(id)!);

  // 4. Finalize: Borders and Improved Centroids
  finalRegions.forEach(region => {
      let sumX = 0;
      let sumY = 0;
      const borders: number[] = [];

      for (const pIdx of region.pixels) {
          const px = pIdx % width;
          const py = Math.floor(pIdx / width);
          sumX += px;
          sumY += py;

          const neighbors = [
            pIdx - width, 
            pIdx + width,
            (px > 0) ? pIdx - 1 : -1,
            (px < width - 1) ? pIdx + 1 : -1
          ];
          
          let isBorder = false;
          for (const nIdx of neighbors) {
              if (nIdx < 0 || nIdx >= pixelCount || regionMap[nIdx] !== region.id) {
                  isBorder = true;
                  break;
              }
          }
          if (isBorder) borders.push(pIdx);
      }

      region.borderPixels = borders;
      
      // Calculate Centroid
      let cx = Math.round(sumX / region.pixels.length);
      let cy = Math.round(sumY / region.pixels.length);
      
      // Ensure centroid is inside the region (Point in Polygon test approximation)
      const cIdx = cy * width + cx;
      if (regionMap[cIdx] !== region.id) {
          // Centroid is outside (concave shape), find nearest pixel in region
          let minD = Infinity;
          let bestP = region.pixels[0];
          
          // Scan a subset if too large, or all if small
          const step = Math.max(1, Math.floor(region.pixels.length / 100));
          for(let i=0; i<region.pixels.length; i+=step) {
              const p = region.pixels[i];
              const px = p % width;
              const py = Math.floor(p / width);
              const d = (px - cx)**2 + (py - cy)**2;
              if (d < minD) {
                  minD = d;
                  bestP = p;
              }
          }
          cx = bestP % width;
          cy = Math.floor(bestP / width);
      }

      region.centroid = { x: cx, y: cy };
      
      tempPalette[region.colorId].count += region.pixels.length;
  });

  return {
    originalWidth: width,
    originalHeight: height,
    regions: finalRegions,
    palette: tempPalette,
    pixelData: new Uint8ClampedArray(data), 
    regionMap
  };
};