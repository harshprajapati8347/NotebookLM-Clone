import { z } from "zod";

export const createNotebookSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer")
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

export const updateNotebookSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(120, "Title must be 120 characters or fewer")
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, "Description must be 500 characters or fewer")
      .nullable()
      .optional(),
  })
  .refine((data) => data.title !== undefined || data.description !== undefined, {
    message: "Provide a title or description to update",
  });
