import { z } from 'zod';

/** Structured output we ask Gemini for when reading a receipt. */
export const ReceiptSchema = z.object({
  merchant: z.string().max(200).nullable(),
  date: z.string().max(40).nullable(),
  currency: z.string().max(8).nullable(),
  total: z.number().nonnegative().max(1_000_000).nullable(),
  items: z.array(z.object({ name: z.string().max(200), price: z.number().nullable() })).max(100),
  confidence: z.number().min(0).max(1),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
