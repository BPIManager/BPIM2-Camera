import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "@/lib/utils";

/** 入力欄の自動移動は止める（キーボードの高さは useKeyboardInset でシート側が合わせる） */
export function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root repositionInputs={false} {...props} />;
}
export const DrawerTitle = DrawerPrimitive.Title;
export const DrawerDescription = DrawerPrimitive.Description;

export function DrawerContent({ className, children, style, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim" />
      <DrawerPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-lg flex-col rounded-t-lg border border-b-0 border-border bg-card text-card-foreground outline-none",
          className,
        )}
        // 見えている高さに収め、キーボードの上に置く。操作ボタンは本文の外に置いて常に見えるようにする
        style={{ bottom: "var(--kb-inset, 0px)", maxHeight: "calc(var(--vv-height, 100dvh) - 0.5rem)", ...style }}
        {...props}
      >
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}
