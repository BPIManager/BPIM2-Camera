import { cn } from "@/lib/utils";

/** 読み込み中の場所取り。値が届くまで、同じ大きさの淡い塊を脈打たせる */
export default function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
