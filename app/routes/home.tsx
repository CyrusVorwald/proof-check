import { Layers, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "ProofCheck - AI-Powered Alcohol Label Verification" },
    {
      name: "description",
      content: "Verify alcohol beverage label compliance with AI-powered analysis.",
    },
  ];
}

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
      <div className="text-center space-y-6 max-w-lg">
        <ShieldCheck className="size-16 mx-auto text-primary" />
        <h1 className="text-4xl font-bold tracking-tight">ProofCheck</h1>
        <p className="text-lg text-muted-foreground">
          AI-powered alcohol beverage label verification. Upload a label image, enter the expected
          label data, and get instant compliance results.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg">
            <Link to="/verify">Start Verification</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/batch">
              <Layers className="size-4 mr-2" />
              Batch Verification
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
