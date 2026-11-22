import { z } from "zod";

/**
 * Validation des entrées (Zod) — R4.
 * Les messages sont en français (l'utilisateur final est francophone).
 */

export const emailSchema = z
  .string()
  .trim()
  .min(3, "L'adresse e-mail est trop courte.")
  .max(254, "L'adresse e-mail est trop longue.")
  .email("Adresse e-mail invalide.")
  .transform((value) => value.toLowerCase());

const passwordRegex = /^(?=.*[A-Za-zÀ-ÿ])(?=.*\d).{8,128}$/;

export const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(128, "Le mot de passe est trop long.")
  .regex(
    passwordRegex,
    "Le mot de passe doit contenir au moins une lettre et un chiffre.",
  );

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Le nom est trop court.")
  .max(120, "Le nom est trop long.");

export const localeSchema = z.enum(["fr", "en"]).default("fr");
export const timezoneSchema = z.string().trim().min(1).max(64).default("Africa/Abidjan");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
  locale: localeSchema.optional(),
  timezone: timezoneSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Le mot de passe est requis.").max(128),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10, "Le lien est invalide.").max(200),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(formulaire)"} : ${issue.message}`);
}
