/** 撮影に使うカメラの映像を開く。deviceId があればそのカメラ、使えなければ（外した・端末を替えたなど）背面カメラに戻す */
export async function openCameraStream(deviceId?: string | null): Promise<MediaStream> {
  const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, ...size }, audio: false });
    } catch (e) {
      // 許可がないときは、背面に戻しても同じなので、そのまま失敗させる
      if (e instanceof DOMException && e.name === "NotAllowedError") throw e;
    }
  }
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, ...size }, audio: false });
}

export interface CameraOption {
  deviceId: string;
  label: string;
}

/**
 * 使えるカメラの一覧。ラベルは、カメラの許可を得るまで空なので、先に一度開いてから一覧を取る
 * （許可がなければ例外。呼び出し側で扱う）
 */
export async function listCameras(): Promise<CameraOption[]> {
  const probe = await openCameraStream();
  probe.getTracks().forEach((t) => t.stop());
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  return devices.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `カメラ ${i + 1}` }));
}
