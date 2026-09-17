import { z } from "zod";

const email = z
  .string()
  .trim()
  .email("Enter a valid email address.")
  .max(254, "Email address is too long.")
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(8, "Password must contain at least 8 characters.")
  .max(72, "Password must contain no more than 72 characters.");

export const credentialsSchema = z.object({
  email,
  password,
});

export const registrationSchema = credentialsSchema.extend({
  name: z
    .string()
    .trim()
    .min(2, "Name must contain at least 2 characters.")
    .max(50, "Name must contain no more than 50 characters."),
});
