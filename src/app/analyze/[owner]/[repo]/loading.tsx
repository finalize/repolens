import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function AnalyzeLoading() {
  return (
    <Card>
      <CardHeader>
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-6 w-16 animate-pulse rounded-full bg-muted"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
