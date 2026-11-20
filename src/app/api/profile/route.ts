import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseJsonBody, safeServerError } from "@/lib/api-utils";
import { getUser } from "@/lib/supabase/server";

const isoDateOptional = z
  .union([
    z.literal(""),
    z.null(),
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date format."),
  ])
  .optional()
  .transform((v) => (v ? v : null));

const profileSchema = z.object({
  name_last_first: z.string().trim().max(120),
  name_first_last: z.string().trim().max(120),
  office: z.string().trim().max(80).default("DNX"),
  default_verifier: z.string().trim().max(120).default(""),
  default_daily_hours: z.coerce.number().min(0).max(24).default(8),
  internship_start_date: isoDateOptional,
  target_ojt_hours: z.coerce.number().int().min(40).max(5000).default(486),
});

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date, target_ojt_hours, updated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) return safeServerError("api/profile GET", error, "Could not load profile.");
  return NextResponse.json({
    profile: data ?? {
      id: user.id,
      name_last_first: "",
      name_first_last: "",
      office: "DNX",
      default_verifier: "",
      default_daily_hours: 8,
      internship_start_date: null,
      target_ojt_hours: 486,
    },
  });
}

export async function PUT(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "Unauthorized");

  const body = await parseJsonBody(request, profileSchema, "Invalid profile data.");
  if (body.response) return body.response;

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        name_last_first: body.data.name_last_first.toUpperCase(),
        name_first_last: body.data.name_first_last.toUpperCase(),
        office: body.data.office || "DNX",
        default_verifier: body.data.default_verifier.toUpperCase(),
        default_daily_hours: body.data.default_daily_hours,
        internship_start_date: body.data.internship_start_date ?? null,
        target_ojt_hours: body.data.target_ojt_hours,
      },
      { onConflict: "id" },
    )
    .select(
      "id, name_last_first, name_first_last, office, default_verifier, default_daily_hours, internship_start_date, target_ojt_hours, updated_at",
    )
    .single();

  if (error) return safeServerError("api/profile PUT", error, "Could not save profile.");
  return NextResponse.json({ profile: data });
}
