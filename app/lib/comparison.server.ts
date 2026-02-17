import { STANDARD_GOV_WARNING } from "./constants";
import type {
  ApplicationData,
  ExtractedLabel,
  FieldResult,
  GovernmentWarningCheck,
  NormalizationNote,
  ParsedAlcoholContent,
  VerificationResult,
} from "./types";

export function checkGovernmentWarningCompliance(
  extracted: ExtractedLabel,
): GovernmentWarningCheck {
  const issues: string[] = [];

  if (!extracted.governmentWarning) {
    return {
      textMatch: false,
      allCapsCorrect: null,
      boldCorrect: null,
      extractedText: null,
      issues: ["Government warning not found on label"],
    };
  }

  const normExtracted = extracted.governmentWarning.trim().replace(/\s+/g, " ");
  const normStandard = STANDARD_GOV_WARNING.trim().replace(/\s+/g, " ");

  // Check text match (case-insensitive first, then exact)
  const textMatch = normExtracted.toLowerCase() === normStandard.toLowerCase();

  if (!textMatch) {
    issues.push("Warning text does not match the required TTB standard text");
  } else if (normExtracted !== normStandard) {
    issues.push(
      'Warning text matches but has case differences — "GOVERNMENT WARNING" prefix must be in ALL CAPS',
    );
  }

  // Check "GOVERNMENT WARNING" prefix is in ALL CAPS — can verify from extracted text
  const allCapsCorrect = extracted.governmentWarningAllCaps;
  if (allCapsCorrect === false) {
    issues.push('"GOVERNMENT WARNING:" must appear in ALL CAPS per 27 CFR § 16.22');
  }

  // Bold detection from images is unreliable — only flag when the model
  // is confident the prefix is NOT bold (explicit false, not null)
  const boldCorrect = extracted.governmentWarningBold;
  if (boldCorrect === false) {
    issues.push(
      '"GOVERNMENT WARNING:" should appear in bold type per 27 CFR § 16.22 (verify manually — bold detection from images may be imprecise)',
    );
  }

  return {
    textMatch,
    allCapsCorrect,
    boldCorrect,
    extractedText: extracted.governmentWarning,
    issues,
  };
}

function normalize(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeNetContents(str: string): string {
  // Insert space at digit→letter boundaries ("750ml" → "750 ml")
  return normalize(str).replace(/(\d)([a-z])/g, "$1 $2");
}

function compareBrandName(expected: string, extracted: string | null): FieldResult {
  const result: FieldResult = {
    name: "Brand Name",
    key: "brandName",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Brand name not found on label";
    return result;
  }

  const trimExpected = expected.trim().replace(/\s+/g, " ");
  const trimExtracted = extracted.trim().replace(/\s+/g, " ");
  const normExpected = normalize(expected);
  const normExtracted = normalize(extracted);

  if (trimExpected === trimExtracted) {
    result.status = "match";
    result.explanation = "Brand name matches";
  } else if (normExpected === normExtracted) {
    result.status = "warning";
    result.explanation = "Brand name matches but has case differences";
  } else if (normExtracted.includes(normExpected) || normExpected.includes(normExtracted)) {
    result.status = "warning";
    result.explanation = "Partial match — one contains the other";
  } else {
    result.status = "mismatch";
    result.explanation = `Expected "${expected}", found "${extracted}"`;
  }

  return result;
}

function compareBeverageType(expected: string, extracted: string | null): FieldResult {
  const result: FieldResult = {
    name: "Beverage Type",
    key: "beverageType",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Beverage type could not be determined from label";
    return result;
  }

  if (normalize(expected) === normalize(extracted)) {
    result.status = "match";
    result.explanation = "Beverage type matches";
  } else {
    result.status = "mismatch";
    result.explanation = `Expected "${expected}", found "${extracted}"`;
  }

  return result;
}

function compareClassType(expected: string, extracted: string | null): FieldResult {
  const result: FieldResult = {
    name: "Class/Type",
    key: "classType",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Class/type not found on label";
    return result;
  }

  if (normalize(expected) === normalize(extracted)) {
    result.status = "match";
    result.explanation = "Class/type matches";
  } else {
    result.status = "mismatch";
    result.explanation = `Expected "${expected}", found "${extracted}"`;
  }

  return result;
}

export function parseAlcoholContent(value: string): ParsedAlcoholContent {
  const notes: NormalizationNote[] = [];
  let abv: number | null = null;
  let proof: number | null = null;
  let inferredFromBareNumber = false;

  const trimmed = value.trim();

  // 1. Combined: "40% Alc./Vol. (80 Proof)"
  const combinedMatch = trimmed.match(
    /(\d+(?:\.\d+)?)\s*%\s*(?:alc(?:\.?\s*(?:\/\s*|by\s+)?vol(?:ume)?\.?)?)?[^(]*\((\d+(?:\.\d+)?)\s*proof\)/i,
  );
  if (combinedMatch) {
    abv = parseFloat(combinedMatch[1]);
    proof = parseFloat(combinedMatch[2]);
    const expectedProof = abv * 2;
    if (Math.abs(proof - expectedProof) > 0.1) {
      notes.push({
        text: `Proof (${proof}) doesn't match expected 2×ABV (${expectedProof})`,
        level: "caution",
      });
    }
    return { rawText: trimmed, abv, proof, inferredFromBareNumber, notes };
  }

  // 2. Proof only: "80 Proof"
  const proofMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*proof/i);
  if (proofMatch) {
    proof = parseFloat(proofMatch[1]);
    abv = proof / 2;
    notes.push({
      text: `Converted ${proof} Proof to ${abv}% ABV (US standard: proof = 2 × ABV)`,
      level: "info",
    });
    return { rawText: trimmed, abv, proof, inferredFromBareNumber, notes };
  }

  // 3. Percent with qualifier: "40%", "40% ABV", "40% alc. by vol.", "40 percent alcohol by volume"
  const percentMatch = trimmed.match(
    /(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:alc(?:ohol)?(?:\.?\s*(?:\/\s*|by\s+)?vol(?:ume)?\.?)?|abv)?/i,
  );
  if (percentMatch) {
    abv = parseFloat(percentMatch[1]);
    return { rawText: trimmed, abv, proof, inferredFromBareNumber, notes };
  }

  // 4. Bare number: "40"
  const bareMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (bareMatch) {
    abv = parseFloat(bareMatch[1]);
    inferredFromBareNumber = true;
    notes.push({
      text: `Interpreted '${trimmed}' as ${abv}% ABV (no unit specified)`,
      level: "caution",
    });
    return { rawText: trimmed, abv, proof, inferredFromBareNumber, notes };
  }

  return { rawText: trimmed, abv, proof, inferredFromBareNumber, notes };
}

function compareAlcoholContent(expected: string, extracted: string | null): FieldResult {
  const result: FieldResult = {
    name: "Alcohol Content",
    key: "alcoholContent",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Alcohol content not found on label";
    return result;
  }

  const expectedParsed = parseAlcoholContent(expected);
  const extractedParsed = parseAlcoholContent(extracted);

  if (expectedParsed.abv === null || extractedParsed.abv === null) {
    if (normalize(expected) === normalize(extracted)) {
      result.status = "match";
      result.explanation = "Alcohol content matches (text comparison)";
    } else {
      result.status = "mismatch";
      result.explanation = `Expected "${expected}", found "${extracted}"`;
    }
    return result;
  }

  const diff = Math.abs(expectedParsed.abv - extractedParsed.abv);

  if (diff < 0.001) {
    result.status = "match";
    result.explanation = `Alcohol content matches (${extractedParsed.abv}% ABV)`;
  } else {
    result.status = "mismatch";
    result.explanation = `Expected ${expectedParsed.abv}% ABV, found ${extractedParsed.abv}% ABV`;
  }

  result.normalization = {
    expectedParsed,
    extractedParsed,
    numericDiff: diff,
    diffUnit: "%",
  };

  // Bare number inference → minimum status is warning
  if (
    (expectedParsed.inferredFromBareNumber || extractedParsed.inferredFromBareNumber) &&
    result.status === "match"
  ) {
    result.status = "warning";
    result.explanation += " — needs review (value inferred from bare number)";
  }

  return result;
}

function compareNetContents(expected: string, extracted: string | null): FieldResult {
  const result: FieldResult = {
    name: "Net Contents",
    key: "netContents",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Net contents not found on label";
    return result;
  }

  if (normalizeNetContents(expected) === normalizeNetContents(extracted)) {
    result.status = "match";
    result.explanation = "Net contents match";
  } else {
    result.status = "mismatch";
    result.explanation = `Expected "${expected}", found "${extracted}"`;
  }

  return result;
}

function compareProducerName(expected: string, extracted: string | null): FieldResult {
  const result: FieldResult = {
    name: "Producer Name",
    key: "producerName",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Producer name not found on label";
    return result;
  }

  if (normalize(expected) === normalize(extracted)) {
    result.status = "match";
    result.explanation = "Producer name matches";
  } else {
    result.status = "mismatch";
    result.explanation = `Expected "${expected}", found "${extracted}"`;
  }

  return result;
}

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  st: "street",
  ave: "avenue",
  blvd: "boulevard",
  dr: "drive",
  ln: "lane",
  rd: "road",
  ct: "court",
  pl: "place",
  sq: "square",
  pkwy: "parkway",
  hwy: "highway",
  ste: "suite",
  apt: "apartment",
  fl: "floor",
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
};

export function normalizeAddress(addr: string): string {
  let normalized = normalize(addr).replace(/[.,;]/g, " ").replace(/\s+/g, " ").trim();

  // Replace abbreviations
  normalized = normalized
    .split(" ")
    .map((word) => {
      const clean = word.replace(/\./g, "");
      return ADDRESS_ABBREVIATIONS[clean] || word;
    })
    .join(" ");

  return normalized;
}

function compareProducerAddress(expected: string, extracted: string | null): FieldResult {
  const result: FieldResult = {
    name: "Producer Address",
    key: "producerAddress",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Producer address not found on label";
    return result;
  }

  const normExpected = normalizeAddress(expected);
  const normExtracted = normalizeAddress(extracted);

  if (normExpected === normExtracted) {
    result.status = "match";
    result.explanation = "Producer address matches";
  } else {
    // Check if all key parts are present (order-independent, word-level matching)
    const expectedParts = normExpected.split(" ").filter((p) => p.length > 1);
    const extractedWords = new Set(normExtracted.split(" "));
    const missingParts = expectedParts.filter((part) => !extractedWords.has(part));

    if (missingParts.length === 0) {
      result.status = "match";
      result.explanation = "Address matches (different formatting)";
    } else if (missingParts.length <= 2) {
      result.status = "warning";
      result.explanation = `Address mostly matches, minor differences: missing "${missingParts.join('", "')}"`;
    } else {
      result.status = "mismatch";
      result.explanation = `Expected "${expected}", found "${extracted}"`;
    }
  }

  return result;
}

function compareCountryOfOrigin(expected: string, extracted: string | null): FieldResult {
  const result: FieldResult = {
    name: "Country of Origin",
    key: "countryOfOrigin",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Country of origin not found on label";
    return result;
  }

  // Extract just the country name from phrases like "Product of France"
  const extractCountry = (s: string) =>
    normalize(s)
      .replace(/^(product of|made in|produced in|imported from)\s+/i, "")
      .trim();

  if (extractCountry(expected) === extractCountry(extracted)) {
    result.status = "match";
    result.explanation = "Country of origin matches";
  } else {
    result.status = "mismatch";
    result.explanation = `Expected "${expected}", found "${extracted}"`;
  }

  return result;
}

function compareGovernmentWarning(
  expected: string,
  extracted: string | null,
  allCaps: boolean | null,
  bold: boolean | null,
): FieldResult {
  const result: FieldResult = {
    name: "Government Warning",
    key: "governmentWarning",
    extracted,
    expected,
    status: "match",
    explanation: "",
  };

  if (!extracted) {
    result.status = "not_found";
    result.explanation = "Government warning not found on label";
    return result;
  }

  // Normalize whitespace for comparison but preserve case
  const normExpected = expected.trim().replace(/\s+/g, " ");
  const normExtracted = extracted.trim().replace(/\s+/g, " ");

  // Strict text match
  if (normExpected !== normExtracted) {
    // Check case-insensitive match
    if (normExpected.toLowerCase() === normExtracted.toLowerCase()) {
      result.status = "mismatch";
      result.explanation = "Government warning text has case differences";
    } else {
      result.status = "mismatch";
      result.explanation = `Government warning text does not match. Expected: "${normExpected}", found: "${normExtracted}"`;
    }
    return result;
  }

  // Text matches exactly, now check formatting
  const formattingIssues: string[] = [];

  if (allCaps === false) {
    formattingIssues.push('"GOVERNMENT WARNING:" prefix should be in ALL CAPS');
  }

  if (bold === false) {
    formattingIssues.push("Government warning text does not appear to be bold");
  }

  if (formattingIssues.length > 0) {
    result.status = "warning";
    result.explanation = `Text matches but formatting issues: ${formattingIssues.join("; ")}`;
  } else {
    result.explanation = "Government warning matches with proper formatting";
  }

  return result;
}

export function compareFields(
  expected: ApplicationData,
  extracted: ExtractedLabel,
  processingTimeMs: number,
): VerificationResult {
  const fields: FieldResult[] = [];

  if (expected.beverageType) {
    fields.push(compareBeverageType(expected.beverageType, extracted.beverageType));
  }

  if (expected.brandName) {
    fields.push(compareBrandName(expected.brandName, extracted.brandName));
  }

  if (expected.classType) {
    fields.push(compareClassType(expected.classType, extracted.classType));
  }

  if (expected.alcoholContent) {
    fields.push(compareAlcoholContent(expected.alcoholContent, extracted.alcoholContent));
  }

  if (expected.netContents) {
    fields.push(compareNetContents(expected.netContents, extracted.netContents));
  }

  if (expected.producerName) {
    fields.push(compareProducerName(expected.producerName, extracted.producerName));
  }

  if (expected.producerAddress) {
    fields.push(compareProducerAddress(expected.producerAddress, extracted.producerAddress));
  }

  if (expected.countryOfOrigin) {
    fields.push(compareCountryOfOrigin(expected.countryOfOrigin, extracted.countryOfOrigin));
  }

  if (expected.governmentWarning) {
    fields.push(
      compareGovernmentWarning(
        expected.governmentWarning,
        extracted.governmentWarning,
        extracted.governmentWarningAllCaps,
        extracted.governmentWarningBold,
      ),
    );
  }

  // Always run TTB compliance check (independent of user input)
  const governmentWarningCheck = extracted.isAlcoholLabel
    ? checkGovernmentWarningCompliance(extracted)
    : null;

  // Determine overall status
  let overallStatus: VerificationResult["overallStatus"];

  if (!extracted.isAlcoholLabel) {
    overallStatus = "rejected";
  } else if (fields.some((f) => f.status === "mismatch")) {
    overallStatus = "rejected";
  } else if (fields.some((f) => f.status === "warning" || f.status === "not_found")) {
    overallStatus = "needs_review";
  } else if (governmentWarningCheck?.issues.some((i) => !i.includes("verify manually"))) {
    // Only hard issues (not formatting advisories) trigger needs_review
    overallStatus = "needs_review";
  } else if (fields.length === 0) {
    // No expected data provided — can't approve without comparing anything
    overallStatus = "needs_review";
  } else {
    overallStatus = "approved";
  }

  return {
    overallStatus,
    isAlcoholLabel: extracted.isAlcoholLabel,
    fields,
    governmentWarningCheck,
    imageQuality: extracted.imageQuality,
    confidence: extracted.confidence,
    notes: extracted.notes,
    processingTimeMs,
  };
}
