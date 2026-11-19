"use client";

import { useEffect, useRef, useState } from "react";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function VoiceRecorder({ onTranscript, disabled, compact }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickAudioMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = recorder.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) return;

        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", new File([blob], `voice-note.${ext}`, { type }));
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const json = (await res.json()) as { text?: string; error?: string };
          if (!res.ok) throw new Error(json.error ?? "Transcription failed.");
          if (json.text) onTranscript(json.text);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not transcribe audio.");
        } finally {
          setTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      setSeconds(0);
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied. Allow mic permission and try again.");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || transcribing}
          onClick={recording ? stopRecording : startRecording}
          className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition cursor-pointer disabled:opacity-60 ${
            compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm"
          } ${
            recording
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              recording ? "bg-white animate-pulse" : transcribing ? "bg-amber-500 animate-pulse" : "bg-red-500"
            }`}
          />
          {recording ? `Stop (${mm}:${ss})` : transcribing ? "Transcribing..." : compact ? "Voice" : "Speak Notes"}
        </button>
        {!compact && recording && (
          <span className="text-xs text-red-600 font-medium">Listening — tap Stop when done</span>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
