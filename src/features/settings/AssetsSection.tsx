import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import Button from "@/components/ui/button";
import Label from "@/components/ui/label";
import { formatBytes } from "@/features/ocr/DownloadProgress";
import { ASSET_GROUPS, groupOf, type AssetContext } from "@/lib/recognition/assets";
import { deleteCachedAssets, listCachedAssets, type CachedAsset } from "@/lib/recognition/assetStore";
import { cn } from "@/lib/utils";

/** 一覧の 1 行。ファイルをグループ（モデルの組・ランタイム）ごとにまとめる */
interface Row {
  key: string;
  label: string;
  description: string;
  bytes: number;
  needed: boolean;
  assets: CachedAsset[];
}

function toRows(assets: readonly CachedAsset[], ctx: AssetContext): Row[] {
  const rows: Row[] = [];
  for (const g of ASSET_GROUPS) {
    const mine = assets.filter((a) => !a.legacy && groupOf(a.url)?.id === g.id);
    if (mine.length === 0) continue;
    rows.push({ key: g.id, label: g.label, description: g.description, bytes: mine.reduce((s, a) => s + a.bytes, 0), needed: g.needed(ctx), assets: mine });
  }
  // どのグループにも入らないもの（以前の版のキャッシュ・使わなくなったファイル）
  const others = assets.filter((a) => a.legacy || !groupOf(a.url));
  if (others.length > 0)
    rows.push({ key: "legacy", label: "以前の版のファイル", description: "アプリの更新で使わなくなったモデルやランタイムです", bytes: others.reduce((s, a) => s + a.bytes, 0), needed: false, assets: others });
  return rows;
}

/** 取得済みのモデル・ランタイムの一覧。いまの設定で使わないものを選んで削除できる */
export default function AssetsSection({ ctx }: { ctx: AssetContext | null }) {
  const [assets, setAssets] = useState<CachedAsset[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const refresh = useCallback(() => {
    void listCachedAssets().then(setAssets).catch(() => setAssets([]));
  }, []);
  useEffect(refresh, [refresh]);
  const rows = useMemo(() => (assets && ctx ? toRows(assets, ctx) : []), [assets, ctx]);
  const chosen = rows.filter((r) => selected.has(r.key) && !r.needed);
  const freed = chosen.reduce((s, r) => s + r.bytes, 0);

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3">
      <Label>取得済みのモデル</Label>
      <p className="text-xs text-muted-foreground">読み取りに使うモデルとランタイムです。いまの設定で使わないものは、選んで削除できます（使うときに、また取得します）</p>
      {assets === null ? (
        <p className="text-sm text-muted-foreground">調べています</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ取得していません</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.key}>
              <label className={cn("flex items-center gap-3 py-2", r.needed && "opacity-70")}>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  disabled={r.needed}
                  checked={!r.needed && selected.has(r.key)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.key);
                      else next.delete(r.key);
                      return next;
                    })
                  }
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm">
                    {r.label}
                    <span className={cn("ml-2 text-xs", r.needed ? "text-primary" : "text-muted-foreground")}>{r.needed ? "使用中" : "使っていません"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{r.description}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(r.bytes)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" disabled={chosen.length === 0} onClick={() => setConfirming(true)}>
        {chosen.length === 0 ? "選んだものを削除" : `選んだものを削除（${formatBytes(freed)}）`}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="モデルを削除"
        description={`${chosen.map((r) => r.label).join("・")}を削除します（${formatBytes(freed)}）。あとで使うときは、また取得します。`}
        confirmLabel="削除する"
        destructive
        onConfirm={async () => {
          setConfirming(false);
          await deleteCachedAssets(chosen.flatMap((r) => r.assets));
          setSelected(new Set());
          refresh();
        }}
      />
    </div>
  );
}
