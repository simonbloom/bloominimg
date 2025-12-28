"use client"

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Upload, Download, Copy, RefreshCw, Grid3X3, Sliders, Image as ImageIcon, Package } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import JSZip from 'jszip'

interface GridCell {
  id: string
  opacity: number
  duration: number
  delay: number
}

export default function ImageGridTool() {
  const [image, setImage] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [gridSize, setGridSize] = useState([10]) // Density (used for both if square)
  const [opacityRange, setOpacityRange] = useState([0.2, 0.9])
  const [opacitySteps, setOpacitySteps] = useState(3) // 0 = smooth, >0 = number of levels
  const [durationRange, setDurationRange] = useState([3.1, 10]) // Min/Max duration in seconds
  const [showDots, setShowDots] = useState(true)
  const [gridColor, setGridColor] = useState('#faf9f7')
  const [dotsColor, setDotsColor] = useState('#c9c9c9')

  // Masking state
  const [maskedIndices, setMaskedIndices] = useState<Set<number>>(new Set())
  const [isMaskingMode, setIsMaskingMode] = useState(false)

  const [isAnimated, setIsAnimated] = useState(true)
  const [seed, setSeed] = useState(0)
  const [blendMode, setBlendMode] = useState<'normal' | 'multiply'>('multiply')

  // Calculate rows/cols based on aspect ratio approx, or just strict grid
  // We'll use a fixed number of columns and calculate rows to keep squares square-ish
  const cols = gridSize[0]
  const aspectRatio = dimensions.width / dimensions.height
  const rows = Math.round(cols / aspectRatio) || 1

  const gridCells = useMemo(() => {
    const cells: GridCell[] = []
    // Use a simple seeded random for stability if needed, but for now math.random is fine with seed dep
    const rng = (index: number) => {
      const x = Math.sin(seed + index) * 10000
      return x - Math.floor(x)
    }

    for (let i = 0; i < rows * cols; i++) {
      const randomVal = rng(i)
      // Map valid range
      let opacity = opacityRange[0] + randomVal * (opacityRange[1] - opacityRange[0])

      // Quantize if steps > 0
      if (opacitySteps > 1) {
        const stepSize = (opacityRange[1] - opacityRange[0]) / (opacitySteps - 1)
        const stepIndex = Math.round((opacity - opacityRange[0]) / stepSize)
        opacity = opacityRange[0] + stepIndex * stepSize
      }

      // Calculate random duration and delay using seeded random as well to keep it stable
      const r2 = rng(i + 10000)
      const duration = r2 * (durationRange[1] - durationRange[0]) + durationRange[0]

      const r3 = rng(i + 20000)
      const delay = r3 * 2

      cells.push({
        id: `cell-${i}`,
        opacity,
        duration,
        delay
      })
    }
    return cells
  }, [rows, cols, opacityRange, seed, aspectRatio, opacitySteps, durationRange])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)

      // Load image to get dimensions
      const img = new Image()
      img.onload = () => {
        setDimensions({ width: img.width, height: img.height })
        setImage(url)
      }
      img.src = url
      // Clear mask on new image to match new dimensions
      setMaskedIndices(new Set())
    }
  }

  const toggleMask = (index: number) => {
    setMaskedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const handleExportSVG = () => {
    if (!image) return

    // Create SVG content
    const cellWidth = 100 / cols
    const cellHeight = 100 / rows

    let svgBody = gridCells.map((cell, i) => {
      // Skip masked cells
      if (maskedIndices.has(i)) return ''

      const r = Math.floor(i / cols)
      const c = i % cols
      return `< rect x = "${c * cellWidth}%" y = "${r * cellHeight}%" width = "${cellWidth}%" height = "${cellHeight}%" fill = "${gridColor}" fill - opacity="${cell.opacity.toFixed(3)}" /> `
    }).join('\n')

    if (showDots) {
      const dots = []
      // Create dots at vertices. rows+1 vertical lines, cols+1 horizontal lines
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          dots.push(`< circle cx = "${c * cellWidth}%" cy = "${r * cellHeight}%" r = "2" fill = "${dotsColor}" /> `)
        }
      }
      svgBody += '\n' + dots.join('\n')
    }

    const svgContent = `
  < svg viewBox = "0 0 ${dimensions.width} ${dimensions.height}" xmlns = "http://www.w3.org/2000/svg" >
  < !--Background Image Reference(Optional, typically used as overlay)-- >
  ${svgBody}
</svg > `.trim()

    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'grid-overlay.svg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const generateComponentCode = () => {
    const maskedArrayStr = JSON.stringify(Array.from(maskedIndices));
    const quantizeCode = opacitySteps > 1
      ? `
        const stepSize = (${opacityRange[1]} - ${opacityRange[0]}) / (${opacitySteps} - 1);
        const stepIndex = Math.round((opacity - ${opacityRange[0]}) / stepSize);
        opacity = ${opacityRange[0]} + stepIndex * stepSize;`
      : '';

    return `import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
// Note: Ensure you have 'framer-motion' installed: bun add framer-motion

export const GridOverlay = () => {
  const rows = ${rows};
  const cols = ${cols};
  const showDots = ${showDots};
  const dotsColor = '${dotsColor}';
  const gridColor = '${gridColor}';
  const isAnimated = ${isAnimated};
  const maskedIndices = new Set(${maskedArrayStr});

  // Generate grid cells once to maintain stable random values
  const gridCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < rows * cols; i++) {
      let opacity = Math.random() * (${opacityRange[1]} - ${opacityRange[0]}) + ${opacityRange[0]};${quantizeCode}
      const duration = Math.random() * (${durationRange[1]} - ${durationRange[0]}) + ${durationRange[0]};
      const delay = Math.random() * 2;
      cells.push({ id: i, opacity, duration, delay });
    }
    return cells;
  }, []);

  return (
    <div className="relative w-full h-full max-w-4xl mx-auto overflow-hidden rounded-lg shadow-2xl" style={{ aspectRatio: '${dimensions.width}/${dimensions.height}' }}>
      <img 
        src="./background.png" 
        alt="Background" 
        className="absolute inset-0 w-full h-full object-cover"
        style={{ mixBlendMode: '${blendMode}' }} 
      />

      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: \`repeat(\${cols}, 1fr)\`,
          gridTemplateRows: \`repeat(\${rows}, 1fr)\`
        }}
      >
        {gridCells.map((cell) => {
          if (maskedIndices.has(cell.id)) return <div key={cell.id} />;
          return (
            <motion.div
              key={cell.id}
              initial={{ opacity: cell.opacity }}
              animate={isAnimated ? { 
                opacity: [cell.opacity, cell.opacity * 0.5, cell.opacity] 
              } : { opacity: cell.opacity }}
              transition={isAnimated ? { 
                duration: cell.duration, 
                repeat: Infinity, 
                repeatType: 'reverse',
                ease: "easeInOut", 
                delay: cell.delay 
              } : { duration: 0 }}
              style={{ backgroundColor: gridColor }}
            />
          );
        })}
      </div>

      {showDots && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {Array.from({ length: (rows + 1) * (cols + 1) }).map((_, i) => {
            const r = Math.floor(i / (cols + 1));
            const c = i % (cols + 1);
            return (
              <circle 
                key={i} 
                cx={\`\${(c / cols) * 100}%\`} 
                cy={\`\${(r / rows) * 100}%\`} 
                r="1" 
                fill="${dotsColor}" 
              />
            );
          })}
        </svg>
      )}
    </div>
  );
};
`
  }

  const handleCopyCode = () => {
    const code = generateComponentCode()
    navigator.clipboard.writeText(code)
    alert('React component code copied to clipboard!')
  }

  const handleDownloadPackage = async () => {
    if (!image) return;

    const zip = new JSZip();

    const componentCode = generateComponentCode();

    // 1. Add React Component
    zip.file("GridOverlay.tsx", componentCode);

    // 2. Add "Perfect Prompt" for LLM
    const promptContent = `# Task: Implement Grid Overlay Component

I need you to add a new visual component to my Next.js project. I have attached the necessary code and assets.

## 1. Assets
- I have included an image named \`background.png\` in this zip.
- **Action**: Please move \`background.png\` to my project's \`public/\` folder.

## 2. Dependencies
- This component requires **Framer Motion**.
- **Action**: Run \`bun add framer-motion\` or \`npm install framer-motion\`.

## 3. The Component Code
Create a new file at \`src/components/GridOverlay.tsx\` (or your preferred components directory) and paste the following code exactly. The code works "out of the box" provided the image is in the right place.

\`\`\`tsx
${componentCode}
\`\`\`

## 4. Usage & Styling Requirements (CRITICAL)
- **Positioning**: The component is designed to fill its container (\`absolute inset-0\`). 
- **Container**: You MUST ensure the parent container has \`relative\` positioning.
- **Z-Index**: 
    - The overlay should act as a background. 
    - Ensure your main content has a higher z-index (e.g., \`z-10\`) so it sits *on top* of this grid.
    - If placing this as a full-page background, you might need \`-z-10\` on the overlay or \`z-0\` on the container.

### Example Implementation
\`\`\`tsx
import { GridOverlay } from '@/components/GridOverlay';

export default function Page() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* The Grid Overlay sits behind everything */}
      <GridOverlay />
      
      {/* Main Content sits on top */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen text-white">
        <h1 className="text-4xl font-bold">Welcome to the Future</h1>
      </main>
    </div>
  )
}
\`\`\`

Please implement this structure now.
`
    zip.file("LLM_PROMPT.md", promptContent);

    // 3. Add Image
    try {
      const response = await fetch(image);
      const blob = await response.blob();
      zip.file("background.png", blob);
    } catch (err) {
      console.error("Failed to add image to zip", err);
      alert("Warning: Could not add image to zip.");
    }

    // Generate and Download
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grid-overlay-package.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] gap-6 p-6">
      {/* Sidebar Controls */}
      <Card className="w-full lg:w-80 flex-shrink-0 overflow-y-auto">
        <CardContent className="p-6 space-y-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Settings</h2>
            <p className="text-muted-foreground text-sm">Customize your vector grid.</p>
          </div>

          {/* Upload */}
          <div className="space-y-4">
            <Label htmlFor="image-upload" className="block text-sm font-medium">Base Image</Label>
            <div className="flex items-center gap-2">
              <Input id="image-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <Button variant="outline" className="w-full" onClick={() => document.getElementById('image-upload')?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {image ? 'Change Image' : 'Upload Image'}
              </Button>
            </div>
          </div>

          {/* Grid Density */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>Grid Density (Cols: {cols})</Label>
            </div>
            <Slider
              value={gridSize}
              onValueChange={setGridSize}
              min={5}
              max={100}
              step={1}
            />
          </div>

          {/* Opacity Range */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>Opacity Range ({opacityRange[0]} - {opacityRange[1]})</Label>
            </div>
            <Slider
              value={opacityRange}
              onValueChange={setOpacityRange}
              min={0}
              max={1}
              step={0.05}
              className="py-4"
            />
          </div>

          {/* Opacity Levels */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>Opacity Levels ({opacitySteps === 0 ? 'Smooth' : opacitySteps})</Label>
            </div>
            <Slider
              value={[opacitySteps]}
              onValueChange={(vals) => setOpacitySteps(vals[0])}
              min={0}
              max={10}
              step={1}
            />
            <p className="text-xs text-muted-foreground">0 for smooth random, 2-10 for discrete levels.</p>
          </div>

          {/* Duration Range (Speed) */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <Label>Animation Duration (s) ({durationRange[0]} - {durationRange[1]})</Label>
            </div>
            <Slider
              value={durationRange}
              onValueChange={setDurationRange}
              min={0.1}
              max={10}
              step={0.1}
              className="py-4"
            />
          </div>

          {/* Masking Mode */}
          <div className="space-y-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800 border">
            <div className="flex items-center justify-between">
              <Label htmlFor="mask-toggle">Edit Mask (Hide Squares)</Label>
              <Switch id="mask-toggle" checked={isMaskingMode} onCheckedChange={setIsMaskingMode} />
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, click on grid squares to turn them off (hide).
            </p>
            {maskedIndices.size > 0 && (
              <Button variant="outline" size="sm" onClick={() => setMaskedIndices(new Set())} className="w-full mt-2">
                Clear Mask ({maskedIndices.size} hidden)
              </Button>
            )}
          </div>

          {/* Corner Dots */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="dots-toggle">Show Corner Dots</Label>
              <Switch id="dots-toggle" checked={showDots} onCheckedChange={setShowDots} />
            </div>
            {showDots && (
              <div className="space-y-2">
                <Label>Dots Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={dotsColor}
                    onChange={(e) => setDotsColor(e.target.value)}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <span className="text-sm font-mono text-muted-foreground">{dotsColor}</span>
                </div>
              </div>
            )}
          </div>

          {/* Image Blend Mode */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="blend-toggle">Multiply Image Mode</Label>
              <Switch
                id="blend-toggle"
                checked={blendMode === 'multiply'}
                onCheckedChange={(c) => setBlendMode(c ? 'multiply' : 'normal')}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sets image blend mode to 'multiply'. Effective when overlaying on colors.
            </p>
          </div>

          {/* Color */}
          <div className="space-y-4">
            <Label>Grid Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={gridColor}
                onChange={(e) => setGridColor(e.target.value)}
                className="w-10 h-10 rounded border cursor-pointer"
              />
              <span className="text-sm font-mono text-muted-foreground">{gridColor}</span>
            </div>
          </div>

          {/* Preview Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="animate-toggle">Preview Animation</Label>
              <Switch id="animate-toggle" checked={isAnimated} onCheckedChange={setIsAnimated} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSeed(s => s + 1)} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate Pattern
            </Button>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t space-y-3">
            <Button className="w-full" onClick={handleExportSVG} disabled={!image}>
              <Download className="w-4 h-4 mr-2" />
              Download SVG
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" className="w-full" onClick={handleCopyCode} disabled={!image}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Code
              </Button>
              <Button variant="default" className="w-full" onClick={handleDownloadPackage} disabled={!image}>
                <Package className="w-4 h-4 mr-2" />
                Download Package
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Main Preview Area */}
      <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border flex items-center justify-center p-8 overflow-hidden relative">
        {!image ? (
          <div className="text-center text-muted-foreground flex flex-col items-center">
            <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
            <p>Upload an image to start generating</p>
          </div>
        ) : (
          <div
            className="relative shadow-2xl overflow-hidden rounded-md"
            style={{
              aspectRatio: `${dimensions.width} / ${dimensions.height}`,
              maxHeight: '100%',
              maxWidth: '100%'
            }}
          >
            {/* Background Image */}
            <img
              src={image}
              alt="Preview"
              className="w-full h-full object-cover block"
              style={{ mixBlendMode: blendMode }}
            />

            {/* Grid Overlay */}
            <div
              className="absolute inset-0"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`
              }}
            >
              {gridCells.map((cell, i) => {
                const isMasked = maskedIndices.has(i)
                const shouldAnimate = isAnimated && !isMasked

                // Determine opacity target
                // If masked:
                //   - If Editing: 0.3 (so user can see it exists)
                //   - If Not Editing: 0 (completely hidden)
                // If not masked:
                //   - If Animating: handled by keyframes
                //   - If Static: cell.opacity
                let staticOpacity = cell.opacity
                if (isMasked) {
                  staticOpacity = isMaskingMode ? 0.3 : 0
                }

                return (
                  <motion.div
                    key={cell.id}
                    onClick={() => isMaskingMode && toggleMask(i)}
                    initial={false}
                    animate={shouldAnimate ? {
                      opacity: [cell.opacity, cell.opacity * 0.5, cell.opacity],
                    } : {
                      opacity: staticOpacity
                    }}
                    transition={shouldAnimate ? {
                      duration: cell.duration,
                      repeat: Infinity,
                      repeatType: "reverse",
                      ease: "easeInOut",
                      delay: cell.delay
                    } : { duration: 0.3 }} // Simple transition when toggling states
                    className={cn(
                      "transition-colors duration-200",
                      isMaskingMode && "cursor-pointer hover:z-10",
                      isMaskingMode && !isMasked && "hover:ring-1 hover:ring-red-500", // Hover effect on active cells
                      isMasked && isMaskingMode && "bg-red-500 ring-1 ring-red-500" // Visual cue for masked cells in edit mode
                    )}
                    style={{
                      // If masked and editing, override color to red via class, or use style here if class fails
                      // We use transparency in class/style to show it's "off"
                      backgroundColor: isMasked && isMaskingMode ? undefined : gridColor,
                    }}
                  />
                )
              })}
            </div>

            {/* Dots Overlay */}
            {showDots && (
              <div className="absolute inset-0 pointer-events-none">
                <svg className="w-full h-full">
                  {Array.from({ length: (rows + 1) * (cols + 1) }).map((_, i) => {
                    const r = Math.floor(i / (cols + 1))
                    const c = i % (cols + 1)
                    return (
                      <circle
                        key={i}
                        cx={`${(c / cols) * 100}%`}
                        cy={`${(r / rows) * 100}%`}
                        r="1"
                        fill={dotsColor}
                      />
                    )
                  })}
                </svg>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
