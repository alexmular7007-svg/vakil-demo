"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { withUser } from "@/lib/db";
import { advocateProfiles } from "@/lib/db/schema";
import { appendAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { INDIAN_STATES, LANGUAGES, PRACTICE_AREAS, STATE_BAR_COUNCILS } from "@/lib/directory/constants";
import { PUBLIC_ADVOCATES_TAG, resetAdvocateVerificationToPending } from "@/lib/directory/advocates";

const text = (max: number) => z.string().trim().max(max);

function profileSchema() {
  const thisYear = new Date().getFullYear();
  return z.object({
    displayName: text(100).min(2, "Enter the name as it appears on the roll."),
    enrolmentNo: text(40)
      .min(3, "Enter your enrolment number.")
      .regex(/^[A-Za-z0-9][A-Za-z0-9./\- ]*$/, "Use letters, numbers, / . - only, e.g. D/1234/2015.")
      .transform((v) => v.toUpperCase().replace(/\s+/g, " ")),
    stateBarCouncil: z.enum(STATE_BAR_COUNCILS, { message: "Choose your State Bar Council." }),
    enrolmentYear: z
      .number({ message: "Enter a year." })
      .int()
      .min(1950, "Check the year.")
      .max(thisYear, "The year cannot be in the future.")
      .nullable(),
    practiceAreas: z.array(z.enum(PRACTICE_AREAS)).min(1, "Choose at least one practice area.").max(8, "Choose up to 8."),
    courts: z.array(text(120).min(2)).max(10, "List up to 10 courts."),
    languages: z.array(z.enum(LANGUAGES)).min(1, "Choose at least one language.").max(8, "Choose up to 8."),
    city: text(80),
    state: z.union([z.enum(INDIAN_STATES), z.literal("")]),
    bio: text(1000),
    isListed: z.boolean(),
    acceptsConsultations: z.boolean(),
  });
}

export type AdvocateProfileInput = z.input<ReturnType<typeof profileSchema>>;

export async function saveAdvocateProfile(input: AdvocateProfileInput): Promise<ActionResult<{ status: string; reset: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return fail("Please sign in.");
  const parsed = profileSchema().safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  const v = parsed.data;
  try {
    await enforceRateLimit(`advocate-profile:${user.id}`, 20, 3600);
    const [existing] = await withUser(user.id, (tx) =>
      tx
        .select({
          enrolmentNo: advocateProfiles.enrolmentNo,
          stateBarCouncil: advocateProfiles.stateBarCouncil,
          status: advocateProfiles.verificationStatus,
        })
        .from(advocateProfiles)
        .where(eq(advocateProfiles.userId, user.id))
        .limit(1),
    );

    const identityChanged =
      Boolean(existing) && (existing.enrolmentNo !== v.enrolmentNo || existing.stateBarCouncil !== v.stateBarCouncil);
    const resetReason =
      existing && existing.status === "verified" && identityChanged
        ? ("enrolment_changed" as const)
        : existing && existing.status === "rejected"
          ? ("resubmitted" as const)
          : null;

    // Fail closed: move back to pending first (owner connection, can only set pending),
    // then save the new details as the user.
    if (resetReason) await resetAdvocateVerificationToPending(user.id, resetReason);

    const values = {
      displayName: v.displayName,
      enrolmentNo: v.enrolmentNo,
      stateBarCouncil: v.stateBarCouncil,
      enrolmentYear: v.enrolmentYear,
      practiceAreas: v.practiceAreas,
      courts: Array.from(new Set(v.courts)),
      languages: v.languages,
      city: v.city || null,
      state: v.state || null,
      bio: v.bio || null,
      isListed: v.isListed,
      acceptsConsultations: v.acceptsConsultations,
      updatedAt: new Date(),
    };

    await withUser(user.id, async (tx) => {
      if (existing) {
        await tx.update(advocateProfiles).set(values).where(eq(advocateProfiles.userId, user.id));
      } else {
        await tx.insert(advocateProfiles).values({ userId: user.id, ...values });
      }
    });

    await appendAudit({
      action: existing ? "advocate.profile_updated" : "advocate.profile_submitted",
      actorId: user.id,
      entityType: "advocate_profile",
      entityId: user.id,
      data: { stateBarCouncil: v.stateBarCouncil, isListed: v.isListed, reset: resetReason },
    });

    if (!existing || resetReason) {
      await sendEmail({
        to: user.email,
        subject: "Your advocate verification request is with us",
        text: `Hello ${user.name},\n\nWe have received your advocate verification details (enrolment ${v.enrolmentNo}, ${v.stateBarCouncil}). An administrator will check them against the State Bar Council roll and email you the result.\n\nYour profile appears in the advocate directory only after verification, and only if you chose to be listed.\n\n— Vaakil AI`,
      }).catch((err) => console.error("[advocate] confirmation email failed", err));
    }

    updateTag(PUBLIC_ADVOCATES_TAG);
    revalidatePath("/app/settings/advocate");
    revalidatePath("/app", "layout");
    const status = !existing || resetReason ? "pending" : existing.status;
    return ok({ status, reset: Boolean(resetReason) });
  } catch (err) {
    return toActionError(err);
  }
}
