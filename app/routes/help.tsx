import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";

export function meta() {
  return [
    { title: "Help - ProofCheck" },
    {
      name: "description",
      content: "How to use ProofCheck for alcohol beverage label verification",
    },
  ];
}

export default function Help() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Help</h1>
        <p className="text-muted-foreground">
          Learn how to use ProofCheck for alcohol beverage label verification.
        </p>
      </div>

      <div className="space-y-8">
        {/* Getting Started */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Getting Started</h2>
          <p className="text-sm text-muted-foreground mb-3">
            ProofCheck helps you verify alcohol beverage labels against TTB (Alcohol and Tobacco Tax
            and Trade Bureau) regulations. There are two workflows:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            <li>
              <strong>Single Label Verification</strong> — Upload one label image, extract text, and
              compare against expected data.
            </li>
            <li>
              <strong>Batch Verification</strong> — Upload multiple label images and process them
              all at once.
            </li>
          </ul>
        </section>

        <Separator />

        {/* Single Label Verification */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Single Label Verification</h2>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 1: Upload a Label Image</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>Upload a photo of the alcohol beverage label you want to verify.</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Supported formats: JPG, PNG, WebP</li>
                  <li>Maximum file size: 5 MB</li>
                  <li>For best results, use a clear, well-lit photo taken straight-on</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 2: AI Extracts Text</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  The AI model reads text from the label image, extracting fields like brand name,
                  alcohol content, net contents, producer information, and the government warning.
                </p>
                <p>
                  The government warning is automatically checked against the standard TTB text
                  required under 27 CFR &sect; 16.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Step 3: Compare with Expected Data (Optional)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Enter the expected label data (e.g. from your COLA application) to compare against
                  what was extracted. The system normalizes values automatically — for example, "80
                  Proof" and "40% ABV" are recognized as equivalent.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Batch Verification */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Batch Verification</h2>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Uploading Multiple Images</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Drag and drop or select multiple label images at once. All images are processed
                  concurrently for faster results.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">CSV Import</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Upload a CSV file to auto-populate expected data for each label. The CSV should
                  include:
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    A <code className="bg-muted px-1 rounded">fileName</code> column matching your
                    uploaded image file names
                  </li>
                  <li>
                    Columns for label fields:{" "}
                    <code className="bg-muted px-1 rounded">brandName</code>,{" "}
                    <code className="bg-muted px-1 rounded">alcoholContent</code>,{" "}
                    <code className="bg-muted px-1 rounded">netContents</code>, etc.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Template Feature</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Use the template form to fill in data common to all labels (e.g. producer name and
                  address), then click "Apply to All Files" to copy it to every label's form.
                  Individual labels can still be overridden.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Understanding Results */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Understanding Results</h2>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overall Status</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <ul className="space-y-2">
                  <li>
                    <strong className="text-green-600">Approved</strong> — All fields match the
                    expected label data.
                  </li>
                  <li>
                    <strong className="text-yellow-600">Needs Review</strong> — Some fields have
                    minor differences that may still be acceptable. Manual review is recommended.
                  </li>
                  <li>
                    <strong className="text-red-600">Rejected</strong> — One or more fields do not
                    match the expected data.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Field Statuses</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <ul className="space-y-2">
                  <li>
                    <strong className="text-green-600">Match</strong> — The extracted value matches
                    the expected value.
                  </li>
                  <li>
                    <strong className="text-yellow-600">Warning</strong> — Minor difference detected
                    (e.g. case variation). May still be acceptable.
                  </li>
                  <li>
                    <strong className="text-red-600">Mismatch</strong> — The extracted value does
                    not match the expected value.
                  </li>
                  <li>
                    <strong className="text-muted-foreground">Not Found</strong> — This field was
                    not detected on the label.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Government Warning Compliance</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Every label is automatically checked against the standard TTB government warning
                  text required under 27 CFR &sect; 16. This check runs regardless of whether you
                  provide expected data.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Confidence &amp; Image Quality</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong>Confidence</strong> indicates how certain the AI model is in its
                  extraction. A higher percentage means more reliable results.
                </p>
                <p>
                  <strong>Image quality</strong> is the AI's assessment of the uploaded image
                  clarity. Poor image quality may lead to less accurate extractions.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Tips */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Tips</h2>
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Best Practices for Label Photos</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <ul className="list-disc list-inside space-y-1">
                  <li>Use good, even lighting — avoid shadows across the text</li>
                  <li>Take the photo straight-on to minimize distortion</li>
                  <li>Avoid glare, especially on glossy or metallic labels</li>
                  <li>Make sure all text is in focus and fully visible in the frame</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Model Selection</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong>Sonnet</strong> — More accurate but slower. Best for final verification
                    and difficult-to-read labels.
                  </li>
                  <li>
                    <strong>Haiku</strong> — Faster but may miss some details. Good for quick checks
                    and batch processing.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supported Input Formats</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>The system normalizes common formats automatically:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    <strong>Alcohol content:</strong> 40% ABV, 80 Proof, 40% Alc./Vol., or just "40"
                  </li>
                  <li>
                    <strong>Net contents:</strong> Compared as text (case-insensitive). Enter the
                    value exactly as it appears on the label.
                  </li>
                  <li>
                    <strong>Addresses:</strong> Abbreviations like St, Ave, Blvd are expanded for
                    comparison
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
