import { cn } from "@/lib/utils";

/** 同期で送るサービス */
export type ServiceId = "bpim2" | "beat-seeker";

/** 同期のメニューと、ボタンの横のアイコンに出す、サービス 1 つ分の状態 */
export interface SyncService {
  id: ServiceId;
  label: string;
  /** public/icons の画像（そのサービスの favicon） */
  icon: string;
  /** 押したときに送る（送れて、メニューで外してもいない） */
  on: boolean;
  /** 送れない理由。送れるなら null（アイコンを淡くし、メニューに理由を出す） */
  blocked: string | null;
}

export const SERVICE_ICONS: Record<ServiceId, { label: string; icon: string }> = {
  bpim2: { label: "BPIM2", icon: "/icons/bpim2.svg" },
  "beat-seeker": { label: "beat-seeker", icon: "/icons/beat-seeker.svg" },
};

/** サービスのアイコン。送るものは普通に、送らない（外した・送れない）ものは淡く出す */
export function ServiceIcon({ service, className }: { service: SyncService; className?: string }) {
  return (
    <img
      src={service.icon}
      alt=""
      title={`${service.label}${service.on ? "" : service.blocked ? `（${service.blocked}）` : "（送らない）"}`}
      className={cn("size-4 shrink-0 rounded-[3px] transition-opacity", !service.on && "opacity-35 grayscale", className)}
    />
  );
}
