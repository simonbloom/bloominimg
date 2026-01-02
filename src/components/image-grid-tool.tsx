"use client"

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Download, Copy, RefreshCw, Grid3X3, Sliders, Image as ImageIcon, Package, ChevronDown } from 'lucide-react'
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

interface SectionProps {
  title: string
  children: React.ReactNode
  toggle?: { checked: boolean; onCheckedChange: (v: boolean) => void }
  defaultOpen?: boolean
}

function Section({ title, children, toggle, defaultOpen = true }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const showContent = toggle ? toggle.checked && isOpen : isOpen

  return (
    <div className="border-t border-border">
      <div className="flex w-full items-center justify-between py-3">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 text-left hover:text-foreground/80 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
          <span className="text-sm font-medium">{title}</span>
        </button>
        {toggle && (
          <Switch
            checked={toggle.checked}
            onCheckedChange={toggle.onCheckedChange}
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        {showContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-4 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
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
  const [dotsSize, setDotsSize] = useState(1)
  const [showStroke, setShowStroke] = useState(false)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(1)
  const [strokeOpacityMultiplier, setStrokeOpacityMultiplier] = useState(1.5)

  // Masking state
  const [maskedIndices, setMaskedIndices] = useState<Set<number>>(new Set())
  const [isMaskingMode, setIsMaskingMode] = useState(false)

  const [isAnimated, setIsAnimated] = useState(false)
  const [seed, setSeed] = useState(0)
  const [blendMode, setBlendMode] = useState<'normal' | 'multiply'>('multiply')

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setDimensions({ width: img.width, height: img.height })
      setImage('/default-image.png')
    }
    img.src = '/default-image.png'
  }, [])

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
  const dotsSize = ${dotsSize};
  const gridColor = '${gridColor}';
  const showStroke = ${showStroke};
  const strokeColor = '${strokeColor}';
  const strokeWidth = ${strokeWidth};
  const strokeOpacityMultiplier = ${strokeOpacityMultiplier};
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
    <div className="relative w-full h-full max-w-4xl mx-auto overflow-hidden" style={{ aspectRatio: '${dimensions.width}/${dimensions.height}' }}>
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
              style={{ 
                backgroundColor: gridColor,
                boxShadow: showStroke ? \`inset 0 0 0 \${strokeWidth}px rgba(\${parseInt(strokeColor.slice(1, 3), 16)}, \${parseInt(strokeColor.slice(3, 5), 16)}, \${parseInt(strokeColor.slice(5, 7), 16)}, \${Math.min(1, cell.opacity * strokeOpacityMultiplier)})\` : undefined
              }}
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
                r={dotsSize} 
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
    <div className="flex flex-col lg:flex-row h-screen gap-6 p-6">
      {/* Sidebar Controls */}
      <Card className="w-full lg:w-80 flex-shrink-0 overflow-y-auto py-0">
        <CardContent className="p-4">
          <h1 className="text-lg font-semibold pb-4">Bloomin-img</h1>

          <Section title="Image">
            <Input id="image-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <Button variant="outline" className="w-full" onClick={() => document.getElementById('image-upload')?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              {image ? 'Change Image' : 'Upload Image'}
            </Button>
            <div className="flex items-center justify-between">
              <span className="text-sm">Multiply Blend</span>
              <Switch
                checked={blendMode === 'multiply'}
                onCheckedChange={(c) => setBlendMode(c ? 'multiply' : 'normal')}
              />
            </div>
          </Section>

          <Section title="Grid">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Density</span>
                <span className="text-muted-foreground">{cols} cols</span>
              </div>
              <Slider value={gridSize} onValueChange={setGridSize} min={5} max={100} step={1} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={gridColor}
                  onChange={(e) => setGridColor(e.target.value)}
                  className="w-8 h-8 border cursor-pointer"
                />
                <span className="text-xs font-mono text-muted-foreground">{gridColor}</span>
              </div>
            </div>
          </Section>

          <Section title="Opacity">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Range</span>
                <span className="text-muted-foreground">{opacityRange[0]} - {opacityRange[1]}</span>
              </div>
              <Slider value={opacityRange} onValueChange={setOpacityRange} min={0} max={1} step={0.05} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Levels</span>
                <span className="text-muted-foreground">{opacitySteps === 0 ? 'Smooth' : opacitySteps}</span>
              </div>
              <Slider value={[opacitySteps]} onValueChange={(vals) => setOpacitySteps(vals[0])} min={0} max={10} step={1} />
            </div>
          </Section>

          <Section title="Dots" toggle={{ checked: showDots, onCheckedChange: setShowDots }}>
            <div className="flex items-center justify-between">
              <span className="text-sm">Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={dotsColor}
                  onChange={(e) => setDotsColor(e.target.value)}
                  className="w-8 h-8 border cursor-pointer"
                />
                <span className="text-xs font-mono text-muted-foreground">{dotsColor}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Size</span>
                <span className="text-muted-foreground">{dotsSize}</span>
              </div>
              <Slider value={[dotsSize]} onValueChange={(vals) => setDotsSize(vals[0])} min={0.5} max={5} step={0.5} />
            </div>
          </Section>

          <Section title="Stroke" toggle={{ checked: showStroke, onCheckedChange: setShowStroke }} defaultOpen={false}>
            <div className="flex items-center justify-between">
              <span className="text-sm">Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  className="w-8 h-8 border cursor-pointer"
                />
                <span className="text-xs font-mono text-muted-foreground">{strokeColor}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Width</span>
                <span className="text-muted-foreground">{strokeWidth}px</span>
              </div>
              <Slider value={[strokeWidth]} onValueChange={(vals) => setStrokeWidth(vals[0])} min={0.5} max={5} step={0.5} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Opacity Mult</span>
                <span className="text-muted-foreground">{strokeOpacityMultiplier}x</span>
              </div>
              <Slider value={[strokeOpacityMultiplier]} onValueChange={(vals) => setStrokeOpacityMultiplier(vals[0])} min={0.5} max={3} step={0.1} />
            </div>
          </Section>

          <Section title="Mask" toggle={{ checked: isMaskingMode, onCheckedChange: setIsMaskingMode }} defaultOpen={false}>
            <p className="text-xs text-muted-foreground">Click squares to hide them.</p>
            {maskedIndices.size > 0 && (
              <Button variant="outline" size="sm" onClick={() => setMaskedIndices(new Set())} className="w-full">
                Clear ({maskedIndices.size} hidden)
              </Button>
            )}
          </Section>

          <Section title="Animation" toggle={{ checked: isAnimated, onCheckedChange: setIsAnimated }}>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Duration</span>
                <span className="text-muted-foreground">{durationRange[0]}s - {durationRange[1]}s</span>
              </div>
              <Slider value={durationRange} onValueChange={setDurationRange} min={0.1} max={10} step={0.1} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSeed(s => s + 1)} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate
            </Button>
          </Section>

          <Section title="Export">
            <Button className="w-full" onClick={handleExportSVG} disabled={!image}>
              <Download className="w-4 h-4 mr-2" />
              Download SVG
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={handleCopyCode} disabled={!image}>
                <Copy className="w-4 h-4 mr-2" />
                Code
              </Button>
              <Button variant="default" size="sm" onClick={handleDownloadPackage} disabled={!image}>
                <Package className="w-4 h-4 mr-2" />
                Package
              </Button>
            </div>
          </Section>

        </CardContent>
      </Card>

      {/* Main Preview Area */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
        {!image ? (
          <div className="text-center text-muted-foreground flex flex-col items-center">
            <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
            <p>Upload an image to start generating</p>
          </div>
        ) : (
          <div
            className="relative overflow-hidden"
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
                    key={`${cell.id}-${durationRange[0]}-${durationRange[1]}-${isAnimated}`}
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
                      backgroundColor: isMasked && isMaskingMode ? undefined : gridColor,
                      boxShadow: showStroke && !isMasked
                        ? `inset 0 0 0 ${strokeWidth}px rgba(${parseInt(strokeColor.slice(1, 3), 16)}, ${parseInt(strokeColor.slice(3, 5), 16)}, ${parseInt(strokeColor.slice(5, 7), 16)}, ${Math.min(1, cell.opacity * strokeOpacityMultiplier)})`
                        : undefined
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
                        r={dotsSize}
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
