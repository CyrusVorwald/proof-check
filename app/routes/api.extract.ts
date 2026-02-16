import { checkGovernmentWarningCompliance } from "~/lib/comparison.server";
import type { ModelChoice } from "~/lib/extraction.server";
import { extractLabelData } from "~/lib/extraction.server";
import type { ExtractActionResult } from "~/lib/types";
import { arrayBufferToBase64 } from "~/lib/utils";
import type { Route } from "./+types/api.extract";

export async function action({ request, context }: Route.ActionArgs) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const model = (formData.get("model") as ModelChoice) || "sonnet";

    if (!file || file.size === 0) {
      return Response.json({ error: "Please upload a label image." }, { status: 400 });
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return Response.json(
        {
          error: "Invalid file type. Please upload a JPG, PNG, or WebP image.",
        },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(arrayBuffer);
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp";

    const extractedLabel = await extractLabelData(
      imageBase64,
      mediaType,
      context.cloudflare.env,
      model,
    );
    const processingTimeMs = Date.now() - startTime;

    const governmentWarningCheck = extractedLabel.isAlcoholLabel
      ? checkGovernmentWarningCompliance(extractedLabel)
      : null;

    return Response.json({
      extractedLabel,
      governmentWarningCheck,
      processingTimeMs,
    } satisfies ExtractActionResult);
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "An unexpected error occurred during extraction.",
      },
      { status: 500 },
    );
  }
}
