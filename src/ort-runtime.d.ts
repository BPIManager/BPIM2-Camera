/** onnxruntime-web のランタイム（WASM）の URL。vite.config の ortFlavor プラグインが、CPU 用・GPU 用を出し分ける */
declare module "virtual:ort-runtime-cpu" {
  const url: string;
  export default url;
}
declare module "virtual:ort-runtime-gpu" {
  const url: string;
  export default url;
}
