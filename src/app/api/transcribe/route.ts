import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getGroq, GROQ_STT_MODEL, groqErrorResponse } from "@/lib/ai/groq";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB (Groq free tier limit is 25 MB)

export async function POST(request: Request) {
  const { user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "No audio recording received." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio clip exceeds the 20 MB limit." }, { status: 413 });
    }

    const transcription = await getGroq().audio.transcriptions.create({
      file: audio,
      model: GROQ_STT_MODEL,
      response_format: "json",
      prompt:
        "Weekly accomplishment report notes for a student intern: Monday, Tuesday, Wednesday, Thursday, Friday, hours worked, office YML, trainings, problems encountered, solutions done.",
    });

    return NextResponse.json({ text: transcription.text?.trim() ?? "" });
  } catch (err) {
    const mapped = groqErrorResponse(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
