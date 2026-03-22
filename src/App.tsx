import { useEffect, useState, useMemo, useRef } from "react";
import { useAudio } from "./audio/useAudio";
import "./App.css";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

/**
 * Background is set to slight off-white for structured yet welcoming feel
 */
const BACKGROUND_COLOR_LIGHT = "#fefefe";
const BACKGROUND_COLOR_DARK = "#1a1a1a";

// Analyser and Audio settings
// statically-set for internal
const fftSize: number = 2048;
const smoothing: number = 0.5;
const minDecibels: number = -100;
const maxDecibels: number = -30;
const echoCancellation: boolean = false;
const noiseSuppression: boolean = false;
const autoGainControl: boolean = true;

function App() {
  // Emotion states
  const [emotion, setEmotion] = useState<
    | "no mic access"
    | "one moment"
    | "silent"
    | "calm"
    | "excited"
    | "tense"
    | "neutral"
    | "sad"
    | "focused"
    | "expressive"
    | null
  >(null);
  const emotionRef = useRef(emotion);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const volumeHistory = useRef<number[]>([]); // buffer
  // Stability filter refs to prevent rapid emotion changes due to noise
  const candidateEmotion = useRef<string | null>(null);
  const candidateCount = useRef(0);

  // dark mode support
  const [isDark, setIsDark] = useState(false);

  const analyserOptions = useMemo<AnalyserOptions>(
    () => ({
      fftSize,
      smoothingTimeConstant: smoothing,
      minDecibels,
      maxDecibels,
    }),
    [fftSize, smoothing, minDecibels, maxDecibels],
  );

  const audioOptions = useMemo<MediaTrackConstraints>(
    () => ({
      echoCancellation,
      noiseSuppression,
      autoGainControl,
    }),
    [echoCancellation, noiseSuppression, autoGainControl],
  );

  const { frequencyData, timeDomainData, isActive, error, start } = useAudio({
    analyser: analyserOptions,
    audio: audioOptions,
  });

  // dark mode detector
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const updateTheme = () => {
      setIsDark(media.matches);
    };

    updateTheme();
    media.addEventListener("change", updateTheme);

    return () => {
      media.removeEventListener("change", updateTheme);
    };
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  // micState is a derived state to simplify logic in the main loop and avoid redundant checks
  const micState = useMemo(() => {
    if (error) return "denied";

    if (isActive) return "active";

    if (timeDomainData.current.length > 0) return "requesting";

    return "idle";
  }, [isActive, error]);

  /**
   * Helper functions: isSpeaking, getVolume, getSpectralCentroid, getZCR, getSpectralSpread, getVolumeVariance, detectEmotion
    - isSpeaking: Simple threshold-based voice activity detection to filter out background noise
    - getVolume: RMS calculation of time domain data to estimate loudness
    - getSpectralCentroid: Weighted average of frequency bins to capture "brightness" of sound
    - detectEmotion: Heuristic rules based on volume and spectral centroid to classify emotional state
    - getZCR: Zero Crossing Rate to capture noisiness or tension in the voice
    - getSpectralSpread: Variance of frequency distribution to capture "focus" of sound
    - getVolumeVariance: Short-term variance of volume to capture expressiveness or agitation
   */
  const isSpeaking = (volume: number) => {
    return volume > 0.015;
  };

  const getVolume = (timeData: Uint8Array) => {
    let sum = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      sum += v * v;
    }

    return Math.sqrt(sum / timeData.length);
  };

  const getSpectralCentroid = (freqData: Uint8Array) => {
    let weighted = 0;
    let total = 0;

    for (let i = 0; i < freqData.length; i++) {
      weighted += i * freqData[i];
      total += freqData[i];
    }

    return total ? weighted / total : 0;
  };

  const getZCR = (timeData: Uint8Array) => {
    let crossings = 0;

    for (let i = 1; i < timeData.length; i++) {
      const a = timeData[i - 1] - 128;
      const b = timeData[i] - 128;

      if ((a > 0 && b < 0) || (a < 0 && b > 0)) {
        crossings++;
      }
    }

    return crossings / timeData.length;
  };

  const getSpectralSpread = (freqData: Uint8Array, centroid: number) => {
    let sum = 0;
    let weight = 0;

    for (let i = 0; i < freqData.length; i++) {
      sum += freqData[i] * Math.pow(i - centroid, 2);
      weight += freqData[i];
    }

    return Math.sqrt(sum / (weight || 1));
  };

  const getVolumeVariance = (volume: number) => {
    const arr = volumeHistory.current;
    arr.push(volume);
    if (arr.length > 20) arr.shift();

    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;

    return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  };

  // core motion logic
  const detectEmotion = (
    volume: number,
    centroid: number,
    zcr: number,
    spread: number,
    variance: number,
  ) => {
    if (!isSpeaking(volume)) return "silent";

    if (volume < 0.05 && centroid < 250 && variance < 0.0005) return "sad";

    if (volume < 0.07 && centroid < 350 && zcr < 0.08) return "calm";

    if (variance < 0.0008 && spread < 120) return "focused";

    if (volume > 0.1 && centroid > 500 && zcr > 0.12) return "tense";

    if (volume > 0.09 && variance > 0.0015) return "excited";

    if (variance > 0.002) return "expressive";

    return "neutral";
  };

  /**
   * Main loop to analyze audio and update emotion state with throttling to prevent excessive updates
   * Works in both standard and voice-isolation input modes
   **/
  useEffect(() => {
    let rafId: number;
    let lastUpdate = 0;

    const STABILITY_FRAMES = 7; // required consecutive detections

    function loop(time: number) {
      // avoid splashing "no mic access" during page reloads
      if (micState == "idle" || micState == "requesting") {
        if (emotionRef.current !== "one moment") {
          setIsTransitioning(true);

          setTimeout(() => {
            setEmotion("one moment");
            setIsTransitioning(false);
          }, 200);
        }
        // rafId = requestAnimationFrame(loop);
        return;
      }

      // mic permission denied or other error
      if (micState !== "active") {
        if (emotionRef.current !== "no mic access") {
          setIsTransitioning(true);

          setTimeout(() => {
            setEmotion("no mic access");
            setIsTransitioning(false);
          }, 200);
        }
        // rafId = requestAnimationFrame(loop);
        return;
      }

      const timeData = timeDomainData?.current;
      const freqData = frequencyData?.current;

      if (timeData && freqData) {
        // feature extraction
        const volume = getVolume(timeData);
        const centroid = getSpectralCentroid(freqData);
        const zcr = getZCR(timeData);
        const spread = getSpectralSpread(freqData, centroid);
        const variance = getVolumeVariance(volume);

        // detect emotion
        const nextEmotion = detectEmotion(
          volume,
          centroid,
          zcr,
          spread,
          variance,
        );

        // Stability filter
        if (nextEmotion === candidateEmotion.current) {
          candidateCount.current++;
        } else {
          candidateEmotion.current = nextEmotion;
          candidateCount.current = 1;
        }

        const stableEnough = candidateCount.current >= STABILITY_FRAMES;

        const isNewEmotion = nextEmotion !== emotionRef.current;

        // update emotion state with transition
        if (stableEnough && isNewEmotion && time - lastUpdate > 248) {
          setIsTransitioning(true);

          setTimeout(() => {
            setEmotion(nextEmotion);
            setIsTransitioning(false);
          }, 100);

          lastUpdate = time;
        }
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [micState]);

  return (
    <div
      className="app"
      style={{
        backgroundColor: isDark
          ? BACKGROUND_COLOR_DARK
          : BACKGROUND_COLOR_LIGHT,
      }}
    >
      <div
        className="visualizer-container"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
      >
        {/* text is moved up by a threshold to account for human misjudgment of true center mainly due to the offset caused by browser header section */}
        {/* font granularly set inline here to not mess with the layout */}
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: "10%",
            filter: isTransitioning ? "blur(1px)" : "blur(0px)", // blur + fade = jittery feel
            opacity: isTransitioning ? 0 : 1,
            transition: "opacity 200ms ease-in-out", // Smooth fade
            color: isDark ? "white" : "black",
            backgroundColor: "transparent", // Fail-safe
            fontFamily: "Assistant, sans-serif",
            textTransform: "capitalize",
            fontSize: "2rem",
            fontWeight: "400",
          }}
        >
          {emotion && emotion + "."}
        </div>
      </div>
    </div>
  );
}

export default App;
