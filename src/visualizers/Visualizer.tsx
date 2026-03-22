import { useRef, useEffect } from 'react'

export interface VisualizerProps {
  frequencyData: React.RefObject<Uint8Array<ArrayBuffer>>
  timeDomainData: React.RefObject<Uint8Array<ArrayBuffer>>
  isActive: boolean
  width: number
  height: number
}

/**
 * Visualizer - YOUR CANVAS FOR THE CHALLENGE
 *
 * Audio Pipeline (handled by useAudio):
 *   The useAudio hook captures microphone input via the Web Audio API. It creates
 *   an AnalyserNode that performs real-time FFT (Fast Fourier Transform) analysis,
 *   breaking the audio signal into frequency components. The data refs are updated
 *   every frame (~60fps) via requestAnimationFrame—no React re-renders involved.
 *
 * Props provided:
 *   - frequencyData: Ref to Uint8Array of 1024 FFT frequency bins (0-255 values).
 *       Index 0 is the lowest frequency (DC), higher indices = higher frequencies.
 *   - timeDomainData: Ref to Uint8Array of 2048 waveform samples (0-255 values).
 *       Represents the raw audio signal; 128 is silence, 0/255 are extremes.
 *   - isActive: boolean indicating if audio is streaming
 *   - width: Canvas width (fixed, do not override)
 *   - height: Canvas height (fixed, do not override)
 */
export function Visualizer({
  frequencyData,
  timeDomainData,
  isActive,
  width,
  height,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const font = '12px monospace'
    const padding = 12
    const borderRadius = 8
    const controlsHeight = 120 // Space reserved for controls overlay
    const vizHeight = height - controlsHeight
    const halfVizHeight = Math.floor(vizHeight / 2)

    // Helper to draw rounded box
    const drawBox = (x: number, y: number, w: number, h: number, title?: string) => {
      ctx.strokeStyle = '#525252'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x + 0.5, y + 0.5, w, h, borderRadius)
      ctx.stroke()
      if (title) {
        ctx.fillStyle = '#000'
        ctx.font = font
        const titleWidth = ctx.measureText(` ${title} `).width
        ctx.fillRect(x + 12, y - 6, titleWidth, 12)
        ctx.fillStyle = '#a3a3a3'
        ctx.fillText(` ${title} `, x + 12, y + 4)
      }
    }

    // Draw placeholder when not active
    if (!isActive) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#a3a3a3'
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.fillText('> awaiting microphone input...', width / 2, height / 2)
      ctx.textAlign = 'left'
      return
    }

    let frameId: number

    const draw = () => {
      const timeData = timeDomainData.current
      const freqData = frequencyData.current

      // Clear
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      ctx.font = font
      ctx.textAlign = 'left'

      // === WAVEFORM SECTION ===
      const waveY = padding
      const waveH = halfVizHeight - padding * 1.5
      drawBox(padding, waveY, width - padding * 2, waveH, 'WAVEFORM')

      ctx.beginPath()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 3

      const waveDrawW = width - padding * 4
      const sliceWidth = waveDrawW / timeData.length
      let x = padding * 2

      for (let i = 0; i < timeData.length; i++) {
        const normalized = (timeData[i] - 128) / 128
        const y = waveY + waveH / 2 - normalized * (waveH / 2 - 10)

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += sliceWidth
      }
      ctx.stroke()

      // === FREQUENCY SECTION ===
      const freqY = halfVizHeight + padding / 2
      const freqH = halfVizHeight - padding * 1.5
      drawBox(padding, freqY, width - padding * 2, freqH, 'FREQUENCY')

      const barCount = 64
      const barWidth = waveDrawW / barCount
      const freqCenterY = freqY + freqH / 2

      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < barCount; i++) {
        const freqIndex = Math.floor(i * freqData.length / barCount)
        const value = freqData[freqIndex] / 255
        const barHeight = value * (freqH / 2 - 10)

        ctx.fillRect(
          padding * 2 + i * barWidth + 1,
          freqCenterY - barHeight,
          barWidth - 2,
          barHeight * 2
        )
      }

      frameId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [isActive, frequencyData, timeDomainData, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block' }}
    />
  )
}
