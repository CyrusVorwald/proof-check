export const EXTRACTION_PROMPT = `Analyze this alcohol beverage label image and extract all visible text and information.

Important:
- Extract text EXACTLY as it appears on the label (preserve capitalization, punctuation, spacing)
- For government warning, copy EVERY word exactly as printed — include the "GOVERNMENT WARNING:" prefix and both sections (1) and (2). Do not summarize or omit any part
- For classType, extract the full class and type designation as stated on the label (e.g., 'Red Wine', 'Sparkling Wine', 'India Pale Ale', 'Coffee Liqueur'). Do not substitute grape varieties or other descriptors
- If the image is not an alcohol label, set isAlcoholLabel to false and null for all text fields`;
