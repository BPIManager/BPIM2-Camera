import { writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChevronUp, Download, RefreshCw } from "lucide-react";
import { it } from "vitest";
import Button from "@/components/ui/button";
import SyncTargetMenu from "@/features/result/SyncTargetMenu";
import { SERVICE_ICONS, ServiceIcon, type SyncService } from "@/features/result/SyncServices";

/** 同期ボタンと送り先のメニューの見た目を、静的な HTML にする（ヘッドレスの Chrome でスクリーンショットを撮る用）。ONLY=menu で、メニューを開いたものだけ: OUT=<path> pnpm eval renderSync */
const bpim2 = (over: Partial<SyncService> = {}): SyncService => ({ id: "bpim2", ...SERVICE_ICONS.bpim2, on: true, blocked: null, ...over });
const bs = (over: Partial<SyncService> = {}): SyncService => ({ id: "beat-seeker", ...SERVICE_ICONS["beat-seeker"], on: true, blocked: null, ...over });

const footer = (services: SyncService[], label: string, menu = false) =>
  h(
    "div",
    { className: "mb-3" },
    h("p", { className: "mb-1 text-xs text-muted-foreground" }, label),
    h(
      "div",
      { className: "relative grid grid-cols-[1fr_1.4fr] gap-2 border border-border bg-card p-3" },
      h(Button, { variant: "secondary", className: "px-2" }, h(Download), " 画像保存"),
      h(
        "div",
        { className: "relative flex" },
        h(
          Button,
          { variant: "secondary", className: "min-w-0 flex-1 gap-1.5 rounded-r-none px-2" },
          h(RefreshCw),
          h("span", { className: "truncate" }, "同期"),
          h("span", { className: "flex shrink-0 items-center gap-1" }, services.map((s) => h(ServiceIcon, { key: s.id, service: s }))),
        ),
        h(Button, { variant: "secondary", size: "icon", className: "w-9 shrink-0 rounded-l-none border-l border-border" }, h(ChevronUp)),
        menu ? h(SyncTargetMenu, { value: "latest", onChange: () => undefined, onClose: () => undefined, services, onToggle: () => undefined, onRevert: () => undefined }) : null,
      ),
    ),
  );

it("render sync", () => {
  const all = [
    footer([bpim2(), bs()], "BPIM2 と beat-seeker に送る"),
    footer([bpim2()], "BPIM2 だけ（beat-seeker は連携していない）"),
    footer([bpim2(), bs({ on: false, blocked: "クリアランプを選ぶと、登録できます" })], "beat-seeker はランプが分からず送れない（淡くなる）"),
    footer([bpim2({ on: false, blocked: "サインインすると使えます" }), bs()], "BPIM2 は未サインイン"),
    h("div", { style: { height: 330, paddingTop: 300 } }, footer([bpim2(), bs({ on: false, blocked: "クリアランプを選ぶと、登録できます" })], "メニューを開いた", true)),
  ].map((e) => renderToStaticMarkup(e));
  const html = process.env.ONLY === "menu" ? all.at(-1)! : all.join("");
  writeFileSync(process.env.OUT ?? "internal/sync.html", `<!doctype html><html lang="ja"><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>body{margin:0;padding:8px;width:344px;font-family:system-ui,"Yu Gothic UI",sans-serif}</style></head><body class="bg-background text-foreground">${html}</body></html>`);
});
