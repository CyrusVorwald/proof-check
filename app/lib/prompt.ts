export const EXTRACTION_PROMPT = `You are analyzing an alcohol beverage label image. Extract all visible text and information from the label.

Return a JSON object with these exact fields:

{
  "brandName": "The brand name as shown on the label, or null if not found",
  "classType": "The class and type designation as stated on the label (e.g., 'Red Wine', 'Sparkling Wine', 'India Pale Ale', 'Coffee Liqueur', 'German-Style Lager'). This is a required TTB label element, typically printed near the brand name. Extract the full designation exactly as shown — do not substitute grape varieties or other descriptors. Or null if not found",
  "alcoholContent": "The alcohol content exactly as shown (e.g., '40% ALC./VOL.', '12.5% ABV', '80 Proof'), or null",
  "netContents": "The net contents exactly as shown (e.g., '750 mL', '12 FL OZ', '1.75 L'), or null",
  "producerName": "The producer/bottler/importer name, or null",
  "producerAddress": "The producer/bottler/importer address, or null",
  "countryOfOrigin": "The country of origin (e.g., 'Product of France', 'Made in USA'), or null",
  "governmentWarning": "The full government warning text exactly as printed on the label, or null. Include all prefixes, numbers, and special characters",
  "governmentWarningAllCaps": true/false if the 'GOVERNMENT WARNING:' prefix appears in ALL CAPS, or null if no warning found,
  "governmentWarningBold": true/false if the 'GOVERNMENT WARNING:' prefix specifically appears in a bolder/heavier typeface than the rest of the warning text, or null if no warning found or cannot determine,
  "beverageType": "beer" | "wine" | "distilled_spirits" based on the class/type and label content, or null if cannot determine,
  "isAlcoholLabel": true/false whether this image is actually an alcohol beverage label,
  "imageQuality": "good" | "fair" | "poor" based on readability of text,
  "confidence": 0.0 to 1.0 overall confidence in the extraction accuracy,
  "notes": ["Array of strings noting any issues, observations, or uncertainties about the extraction"]
}

Important:
- Extract text EXACTLY as it appears on the label (preserve capitalization, punctuation, spacing)
- For government warning, copy EVERY word exactly as printed — include the "GOVERNMENT WARNING:" prefix and both sections (1) and (2). Do not summarize or omit any part
- If the image is not an alcohol label, set isAlcoholLabel to false and null for all text fields
- Return ONLY valid JSON, no other text`;
