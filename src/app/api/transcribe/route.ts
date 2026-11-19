import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getUser } from "@/lib/supabase/server";
import { getAiSettings, getUserQuotaStatus } from "@/lib/admin";
import { getGroq, GROQ_STT_FALLBACK_MODEL, GROQ_STT_MODEL, groqErrorResponse } from "@/lib/ai/groq";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [quota, aiSettings] = await Promise.all([
    getUserQuotaStatus(supabase, user.id, user.email),
    getAiSettings(supabase),
  ]);

  if (quota.isBlocked) {
    return NextResponse.json(
      { error: "Your AI access is currently paused by the admin." },
      { status: 403 },
    );
  }

  const primaryModel = aiSettings.activeSttModel || GROQ_STT_MODEL;
  const fallbackModel = primaryModel === GROQ_STT_MODEL ? GROQ_STT_FALLBACK_MODEL : GROQ_STT_MODEL;

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "No audio recording received." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio clip exceeds the 20 MB limit." }, { status: 413 });
    }

    const prompt =
      "Weekly accomplishment report notes for a student intern: Monday, Tuesday, Wednesday, Thursday, Friday, hours worked, office DNX, trainings, problems encountered, solutions done.";

    let transcription;
    try {
      transcription = await getGroq().audio.transcriptions.create({
        file: audio,
        model: primaryModel,
        response_format: "json",
        prompt,
      });
    } catch (err) {
      if (err instanceof Groq.APIError && (err.status === 429 || err.status === 404)) {
        transcription = await getGroq().audio.transcriptions.create({
          file: audio,
          model: fallbackModel,
          response_format: "json",
          prompt,
        });
      } else {
        throw err;
      }
    }

    return NextResponse.json({ text: transcription.text?.trim() ?? "" });
  } catch (err) {
    const mapped = groqErrorResponse(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
