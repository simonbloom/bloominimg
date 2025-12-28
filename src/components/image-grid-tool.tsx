"use client"

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Upload, Download, Copy, RefreshCw, Grid3X3, Sliders, Image as ImageIcon } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface GridCell {
  id: string
  opacity: number
}

export default function ImageGridTool() {
  const [image, setImage] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [gridSize, setGridSize] = useState([20]) // Density (used for both if square)
  const [opacityRange, setOpacityRange] = useState([0.1, 0.9])
  const [opacitySteps, setOpacitySteps] = useState(0) // 0 = smooth, >0 = number of levels
  const [durationRange, setDurationRange] = useState([2, 4]) // Min/Max duration in seconds
  const [showDots, setShowDots] = useState(false)
  const [gridColor, setGridColor] = useState('#000000')
  const [dotsColor, setDotsColor] = useState('#ffffff')

  // Masking state
  const [maskedIndices, setMaskedIndices] = useState<Set<number>>(new Set())
  const [isMaskingMode, setIsMaskingMode] = useState(false)

  const [isAnimated, setIsAnimated] = useState(true)
  const [seed, setSeed] = useState(0)

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

      cells.push({
        id: `cell-${i}`,
        opacity
      })
    }
    return cells
  }, [rows, cols, opacityRange, seed, aspectRatio, opacitySteps])

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
      return `<rect x="${c * cellWidth}%" y="${r * cellHeight}%" width="${cellWidth}%" height="${cellHeight}%" fill="${gridColor}" fill-opacity="${cell.opacity.toFixed(3)}" />`
    }).join('\n')

    if (showDots) {
      const dots = []
      // Create dots at vertices. rows+1 vertical lines, cols+1 horizontal lines
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          dots.push(`<circle cx="${c * cellWidth}%" cy="${r * cellHeight}%" r="2" fill="${dotsColor}" />`)
        }
      }
      svgBody += '\n' + dots.join('\n')
    }

    const svgContent = `
<svg viewBox="0 0 ${dimensions.width} ${dimensions.height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background Image Reference (Optional, typically used as overlay) -->
  ${svgBody}
</svg>`.trim()

    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'grid-overlay.svg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleCopyCode = () => {
    // We need to pass the masked indices to the code
    const maskedArrayStr = JSON.stringify(Array.from(maskedIndices));

    const code = `
import { motion } from 'framer-motion';

export const GridOverlay = () => {
  const rows = ${rows};
  const cols = ${cols};
  const showDots = ${showDots};
  const dotsColor = '${dotsColor}';
  const maskedIndices = new Set(${maskedArrayStr});
  
  // This is a simplified version. For exact opacity mapping, you'd export the data array.
  // Here we regenerate random values for a dynamic effect.
  
  return (
    <div className="relative w-full h-full" style={{ aspectRatio: '${dimensions.width}/${dimensions.height}' }}>
      {/* Grid */}
      <div 
        className="absolute inset-0 grid"
        style={{
            gridTemplateColumns: \`repeat(\${cols}, 1fr)\`,
            gridTemplateRows: \`repeat(\${rows}, 1fr)\`
        }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => {
          if (maskedIndices.has(i)) return <div key={i} />; // Render empty div to maintain grid layout

          return (
            <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: Math.random() * (${opacityRange[1]} - ${opacityRange[0]}) + ${opacityRange[0]} }}
                transition={{ 
                    duration: Math.random() * (${durationRange[1]} - ${durationRange[0]}) + ${durationRange[0]}, 
                    repeat: Infinity, 
                    repeatType: 'reverse', 
                    delay: i * 0.01 
                }}
                style={{ backgroundColor: '${gridColor}' }}
            />
          );
        })}
      </div>

      {/* Dots Overlay */}
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
                        r="2" 
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
    navigator.clipboard.writeText(code)
    alert('React component code copied to clipboard!')
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
            <Button variant="secondary" className="w-full" onClick={handleCopyCode} disabled={!image}>
              <Copy className="w-4 h-4 mr-2" />
              Copy React Component
            </Button>
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
                      duration: Math.random() * (durationRange[1] - durationRange[0]) + durationRange[0],
                      repeat: Infinity,
                      repeatType: "reverse",
                      ease: "easeInOut",
                      delay: Math.random() * 2
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
                        r="2"
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

      )
}
