/// <reference lib="webworker" />
import runtime from "virtual:ort-runtime-cpu";
import { startOcrWorker } from "./ocrWorkerCore";

/** CPU で読む Worker。onnxruntime-web は CPU だけの版（vite.config の ortFlavor が出し分ける） */
startOcrWorker(runtime);
