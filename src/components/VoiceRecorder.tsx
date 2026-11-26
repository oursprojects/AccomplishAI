"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { parseJsonResponse } from "@/lib/client-json";

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
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function uploadAudio(blob: Blob, ext: string, attempt = 0): Promise<void> {
    const form = new FormData();
    form.append("audio", new File([blob], `voice-note.${ext}`, { type: blob.type || "audio/webm" }));
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const json = await parseJsonResponse<{ text?: string; error?: string; retryAfterSeconds?: number }>(res);
    if (res.status === 429 && attempt < 1 && !unmountedRef.current) {
      const waitMs = Math.max(2, Math.min(8, Number(json?.retryAfterSeconds ?? 4))) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      if (unmountedRef.current) return;
      return uploadAudio(blob, ext, attempt + 1);
    }
    if (!res.ok) throw new Error(json?.error ?? `Transcription failed (HTTP ${res.status}).`);
    if (json?.text && !unmountedRef.current) onTranscript(json.text);
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (unmountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
        if (unmountedRef.current) return;
        const type = recorder.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 400) {
          setError("Recording too short — speak for at least 1 second.");
          return;
        }

        setTranscribing(true);
        try {
          await uploadAudio(blob, ext, 0);
        } catch (err) {
          if (!unmountedRef.current) {
            setError(err instanceof Error ? err.message : "Could not transcribe audio.");
          }
        } finally {
          if (!unmountedRef.current) setTranscribing(false);
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
          aria-label={recording ? "Stop voice recording" : transcribing ? "Transcribing voice recording" : "Record voice notes"}
          onClick={recording ? stopRecording : startRecording}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/45 cursor-pointer disabled:opacity-60 ${
            compact ? "px-2.5 py-1.5 text-xs h-9 sm:h-8" : "px-4 py-2.5 text-sm min-h-[44px]"
          } ${
            recording
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-[#D8D8D0] bg-white text-[#141413] hover:bg-[#F1F1EE]"
          }`}
        >
          {recording ? (
            <Square className="h-3.5 w-3.5 fill-current animate-pulse" />
          ) : (
            <Mic className={`h-3.5 w-3.5 text-[#1D4ED8] ${transcribing ? "animate-pulse" : ""}`} />
          )}
          {recording ? `Stop (${mm}:${ss})` : transcribing ? "Transcribing..." : compact ? "Voice" : "Speak Notes"}
        </button>
        {!compact && recording && (
          <span role="status" aria-live="polite" className="text-xs text-red-600 font-medium">
            Listening — tap Stop when done
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
