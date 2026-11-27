/// <reference lib="webworker" />
import runtime from "virtual:ort-runtime-gpu";
import { startOcrWorker } from "./ocrWorkerCore";

/** GPU（WebGPU）で読む Worker。onnxruntime-web は WebGPU も使える版。CPU でも読める */
startOcrWorker(runtime);
