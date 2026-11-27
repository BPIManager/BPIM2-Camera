import ConfirmDialog from "@/components/confirm-dialog";
import { saveImage } from "@/lib/share/save";

/** 読み取りを中止したとき、撮影した画像だけ保存するかを確かめる */
export default function UnsavedImageDialog({ image, onClose }: { image: Blob | null; onClose: () => void }) {
  return (
    <ConfirmDialog
      open={image !== null}
      onClose={onClose}
      title="画像を保存しますか？"
      description="読み取りを中止しました。撮影した画像だけ、保存できます。"
      confirmLabel="保存する"
      cancelLabel="保存しない"
      onConfirm={() => {
        onClose();
        if (image) void saveImage(image, `iidx-${Date.now()}.jpg`);
      }}
    />
  );
}
