import { GoogleGenAI } from '@google/genai';
import { ReceiptSchema, type Receipt } from '@tap/shared';

const PROMPT = `You read photos of shopping or restaurant receipts.
Return the merchant name, the purchase date (ISO 8601 if visible), the ISO 4217 currency code,
the final total actually paid (after tax and tip, as a number), and the line items.
Set confidence between 0 and 1 for how sure you are of the total. If the image is not a
receipt or the total is unreadable, return total null and confidence 0.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    currency: { type: ['string', 'null'] },
    total: { type: ['number', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, price: { type: ['number', 'null'] } },
        required: ['name', 'price'],
      },
    },
    confidence: { type: 'number' },
  },
  required: ['merchant', 'date', 'currency', 'total', 'items', 'confidence'],
};

export function createReceiptReader(apiKey: string, model: string) {
  const ai = new GoogleGenAI({ apiKey });
  return async (image: string, mimeType: string): Promise<Receipt> => {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data: image } }, { text: PROMPT }],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    });
    const text = res.text;
    if (!text) throw new Error('empty Gemini response');
    const parsed = ReceiptSchema.parse(JSON.parse(text));
    return { ...parsed, items: parsed.items.slice(0, 50) };
  };
}
