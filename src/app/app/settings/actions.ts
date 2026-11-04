"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { appendAudit } from "@/lib/audit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80, "Keep the name under 80 characters."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^(\+91)?[6-9]\d{9}$/.test(v), "Enter a 10-digit Indian mobile number.")
    .transform((v) => (v === "" ? "" : v.startsWith("+91") ? v : `+91${v}`)),
  locale: z.enum(["en", "hi"]),
  persona: z.enum(["advocate", "student", "business", "individual"]),
});

export type ProfileInput = z.input<typeof profileSchema>;

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  try {
    const { name, phone, locale, persona } = parsed.data;
    await auth.api.updateUser({
      body: { name, phone: phone || null, locale, persona },
      headers: await headers(),
    });
    await appendAudit({
      action: "user.profile_updated",
      actorId: user.id,
      entityType: "user",
      entityId: user.id,
      data: { fields: ["name", "phone", "locale", "persona"] },
    });
    revalidatePath("/app", "layout");
    return ok(undefined);
  } catch (err) {
    return toActionError(err);
  }
}
