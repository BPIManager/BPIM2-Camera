import { useEffect, useRef, useState } from "react";
import { listCameras, openCameraStream, type CameraOption } from "@/lib/camera/stream";

interface Props {
  /** 選んだカメラの deviceId。null は「自動（背面カメラ）」 */
  value: string | null;
  onChange: (deviceId: string | null) => void;
}

type Status = "loading" | "ready" | "denied" | "unsupported";

/** 使うカメラをセレクトボックスで選ぶ。下に、選んだカメラの映像をプレビューする */
export default function CameraPicker({ value, onChange }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [previewError, setPreviewError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 一覧は、カメラの許可を得てから取る
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    let cancelled = false;
    listCameras()
      .then((list) => {
        if (cancelled) return;
        setCameras(list);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("denied"));
    return () => {
      cancelled = true;
    };
  }, []);

  // 選んだカメラのプレビュー。選び直すたびに開き直し、外れるときに止める
  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setPreviewError(false);
    openCameraStream(value)
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          await v.play().catch(() => undefined);
        }
      })
      .catch(() => !cancelled && setPreviewError(true));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [status, value]);

  if (status === "unsupported") return <p className="text-sm text-muted-foreground">この端末ではカメラを使えません。画像の取り込みは使えます。</p>;
  if (status === "denied") return <p className="text-sm text-muted-foreground">カメラが許可されていません。ブラウザの設定で許可すると、選べるようになります。画像の取り込みは使えます。</p>;

  // 保存済みのカメラが、いまの一覧にないときは「自動」として扱う
  const current = cameras.some((c) => c.deviceId === value) ? (value ?? "") : "";
  return (
    <div className="flex flex-col gap-3">
      <select
        aria-label="使うカメラ"
        disabled={status !== "ready"}
        value={current}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-12 w-full rounded-md border border-border bg-background px-3 text-base disabled:opacity-50"
      >
        <option value="">自動（背面カメラ）</option>
        {cameras.map((c) => (
          <option key={c.deviceId} value={c.deviceId}>
            {c.label}
          </option>
        ))}
      </select>
      <div
        className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-card select-none [-webkit-touch-callout:none]"
        onContextMenu={(e) => e.preventDefault()}
      >
        <video ref={videoRef} className="size-full object-cover" playsInline muted />
        {(status === "loading" || previewError) && (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {status === "loading" ? "カメラを確認しています" : "このカメラの映像を表示できません"}
          </p>
        )}
      </div>
    </div>
  );
}
