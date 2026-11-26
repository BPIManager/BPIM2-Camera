import { useState } from "react";
import { cn } from "@/lib/utils";

/** アイコン。読み込めない（COEP で他サイトの画像が阻まれる等）ときは、名前の頭文字にする */
export default function Avatar({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium", className)}>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
      className={cn("size-10 shrink-0 rounded-full object-cover", className)}
    />
  );
}
