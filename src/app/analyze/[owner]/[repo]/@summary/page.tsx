import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SummaryPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI サマリー</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          AI サマリー機能は現在無効です。AIプロバイダーを設定すると、リポジトリの概要・依存関係の解説・リスク評価が自動生成されます。
        </p>
      </CardContent>
    </Card>
  );
}
