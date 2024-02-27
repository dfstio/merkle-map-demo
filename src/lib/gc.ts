import { sleep } from "zkcloudworker";
/*
import v8 from "v8";
import vm from "vm";
v8.setFlagsFromString("--expose_gc");
export const gc = vm.runInNewContext("gc");
*/

export async function collect(runGarbageCollection: boolean = false) {
  await sleep(100);
  if (runGarbageCollection) {
    const memoryData1 = process.memoryUsage();
    if (global.gc === undefined) throw new Error("global.gc is undefined");
    global.gc();
    const memoryData2 = process.memoryUsage();
    if (memoryData1.rss !== memoryData2.rss) {
      console.log(
        "RSS memory changed after GC:",
        Math.round((memoryData1.rss - memoryData2.rss) / 1024),
        "kB"
      );
    }
  }
}
