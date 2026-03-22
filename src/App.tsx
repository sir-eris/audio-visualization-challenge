import { useEffect, useState, useMemo } from 'react'
import { useAudio } from './audio/useAudio'
import { Visualizer } from './visualizers/Visualizer'
import './App.css'

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 480

/**
 * Background color for the visualizer page.
 * Change this to customize your submission's background.
 */
const BACKGROUND_COLOR = '#000'

const FFT_SIZES = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768]

function App() {
  // Analyser options
  const [fftSize, setFftSize] = useState(2048)
  const [smoothing, setSmoothing] = useState(0.5)
  const [minDecibels, setMinDecibels] = useState(-100)
  const [maxDecibels, setMaxDecibels] = useState(-30)

  // Audio options
  const [echoCancellation, setEchoCancellation] = useState(false)
  const [noiseSuppression, setNoiseSuppression] = useState(false)
  const [autoGainControl, setAutoGainControl] = useState(true)

  const analyserOptions = useMemo<AnalyserOptions>(() => ({
    fftSize,
    smoothingTimeConstant: smoothing,
    minDecibels,
    maxDecibels,
  }), [fftSize, smoothing, minDecibels, maxDecibels])

  const audioOptions = useMemo<MediaTrackConstraints>(() => ({
    echoCancellation,
    noiseSuppression,
    autoGainControl,
  }), [echoCancellation, noiseSuppression, autoGainControl])

  const { frequencyData, timeDomainData, isActive, start } = useAudio({
    analyser: analyserOptions,
    audio: audioOptions,
  })

  useEffect(() => {
    start()
  }, [start])

  // Constrained range handlers
  const handleMinDecibels = (value: number) => {
    setMinDecibels(Math.min(value, maxDecibels - 1))
  }

  const handleMaxDecibels = (value: number) => {
    setMaxDecibels(Math.max(value, minDecibels + 1))
  }

  return (
    <div className="app" style={{ backgroundColor: BACKGROUND_COLOR }}>
      <div className="visualizer-container" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        <Visualizer
          frequencyData={frequencyData}
          timeDomainData={timeDomainData}
          isActive={isActive}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        />

        <div className="controls-overlay">
          <fieldset>
            <legend>ANALYSER</legend>

            <label>
              <span className="label">fft_size</span>
              <select value={fftSize} onChange={e => setFftSize(Number(e.target.value))}>
                {FFT_SIZES.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="label">smoothing</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={smoothing}
                onChange={e => setSmoothing(Number(e.target.value))}
              />
              <span className="value">{smoothing.toFixed(2)}</span>
            </label>

            <label>
              <span className="label">db_range</span>
              <div className="dual-range">
                <div className="track" />
                <div
                  className="track-fill"
                  style={{
                    left: `${((minDecibels + 100) / 100) * 100}%`,
                    width: `${((maxDecibels - minDecibels) / 100) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  min="-100"
                  max="0"
                  step="1"
                  value={minDecibels}
                  onChange={e => handleMinDecibels(Number(e.target.value))}
                  title="min dB"
                />
                <input
                  type="range"
                  min="-100"
                  max="0"
                  step="1"
                  value={maxDecibels}
                  onChange={e => handleMaxDecibels(Number(e.target.value))}
                  title="max dB"
                />
              </div>
              <span className="value">{minDecibels}/{maxDecibels}</span>
            </label>
          </fieldset>

          <fieldset>
            <legend>AUDIO_INPUT</legend>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={echoCancellation}
                onChange={e => setEchoCancellation(e.target.checked)}
              />
              <span>echo_cancel</span>
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={noiseSuppression}
                onChange={e => setNoiseSuppression(e.target.checked)}
              />
              <span>noise_suppress</span>
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={autoGainControl}
                onChange={e => setAutoGainControl(e.target.checked)}
              />
              <span>auto_gain</span>
            </label>
          </fieldset>
        </div>
      </div>
    </div>
  )
}

export default App
