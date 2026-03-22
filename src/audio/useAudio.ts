import { useState, useEffect, useRef, useCallback } from 'react'

export interface UseAudioOptions {
  /** AnalyserNode configuration (fftSize, smoothingTimeConstant, minDecibels, maxDecibels) */
  analyser?: AnalyserOptions
  /** MediaTrackConstraints for getUserMedia audio. Merged with defaults. */
  audio?: MediaTrackConstraints
}

export interface UseAudioReturn {
  /** Ref containing FFT frequency data (0-255 values). Updated in-place every frame. */
  frequencyData: React.RefObject<Uint8Array>
  /** Ref containing time-domain waveform data (0-255 values). Updated in-place every frame. */
  timeDomainData: React.RefObject<Uint8Array>
  /** Whether the microphone is active and streaming */
  isActive: boolean
  /** Error message if mic permission denied or unavailable */
  error: string | null
  /** Start microphone capture */
  start: () => Promise<void>
  /** Stop microphone capture */
  stop: () => void
}

const DEFAULT_ANALYSER_OPTIONS = {
  fftSize: 2048,
  smoothingTimeConstant: 0.5,
} satisfies AnalyserOptions

const DEFAULT_AUDIO_OPTIONS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
} satisfies MediaTrackConstraints

/**
 * useAudio - A stable hook for accessing microphone audio data
 *
 * Returns refs that are updated in-place every frame. Consumers should
 * run their own requestAnimationFrame loop to read the data.
 *
 * DO NOT MODIFY THIS FILE - This is the stable audio pipeline for the challenge.
 * Modify src/visualizers/Visualizer.tsx instead.
 */
export function useAudio({ analyser, audio }: UseAudioOptions = {}): UseAudioReturn {
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Audio data buffers - updated in-place, no React re-renders
  // Initialized empty; start() allocates based on actual analyser fftSize
  const frequencyData = useRef(new Uint8Array(0))
  const timeDomainData = useRef(new Uint8Array(0))

  // Web Audio API refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Track mounted state to prevent setState after unmount
  const mountedRef = useRef(true)

  // Session counter for StrictMode safety - prevents stale async operations
  const sessionRef = useRef(0)

  const stop = useCallback(() => {
    // Increment session to invalidate any pending async operations
    sessionRef.current++

    // Always cleanup animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Always cleanup stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // Always cleanup source (we always create it)
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null

    if (mountedRef.current) {
      setIsActive(false)
    }
  }, [])

  const start = useCallback(async () => {
    // Stop any existing session first
    stop()

    // Capture current session for async safety
    const currentSession = sessionRef.current

    try {
      if (mountedRef.current) {
        setError(null)
      }

      // Create AudioContext and AnalyserNode with options
      audioContextRef.current = new AudioContext()
      analyserRef.current = new AnalyserNode(audioContextRef.current, {
        ...DEFAULT_ANALYSER_OPTIONS,
        ...analyser
      })

      // Allocate buffers sized to the analyser
      frequencyData.current = new Uint8Array(analyserRef.current.frequencyBinCount)
      timeDomainData.current = new Uint8Array(analyserRef.current.fftSize)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...DEFAULT_AUDIO_OPTIONS, ...audio }
      })

      // Check if session changed (stop() was called) or component unmounted
      if (currentSession !== sessionRef.current || !mountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      // Resume AudioContext - clicking "Allow" on mic prompt was the user gesture
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      streamRef.current = stream
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream)
      sourceRef.current.connect(analyserRef.current)

      setIsActive(true)

      // Animation loop - updates refs in-place, no React involvement
      const updateData = () => {
        if (!analyserRef.current || currentSession !== sessionRef.current) {
          return
        }

        analyserRef.current.getByteFrequencyData(frequencyData.current)
        analyserRef.current.getByteTimeDomainData(timeDomainData.current)

        animationFrameRef.current = requestAnimationFrame(updateData)
      }

      updateData()
    } catch (err) {
      if (!mountedRef.current || currentSession !== sessionRef.current) return

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone permission denied')
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found')
        } else {
          setError(err.message)
        }
      } else {
        setError('Unknown error occurred')
      }
      setIsActive(false)
    }
  }, [analyser, audio, stop])

  // Track mounted state and cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stop()
    }
  }, [stop])

  return {
    frequencyData,
    timeDomainData,
    isActive,
    error,
    start,
    stop,
  }
}
