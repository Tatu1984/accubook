import Link from "next/link";
import { Button } from "@/frontend/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-semibold">Page not found</h2>
        <p className="text-muted-foreground text-sm">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
