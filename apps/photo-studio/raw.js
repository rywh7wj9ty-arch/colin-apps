// True RAW decoding via LibRaw (WASM) in a Web Worker.
import LibRaw from './libraw/index.js';
async function decodeRaw(buffer, opt={}){
  const lr=new LibRaw(); const t0=performance.now();
  try{
    await lr.open(new Uint8Array(buffer), {
      halfSize:!!opt.half, useCameraWb:true, useAutoWb:false, outputColor:0, outputBps:16, gamm:[1,1],
      noAutoBright:true, adjustMaximumThr:0, highlight:opt.highlight??2, userQual:opt.half?0:3, userFlip:0, useFujiRotate:-1, ...(opt.cropbox?{cropbox:opt.cropbox}:{}), ...(opt.noInterp?{noInterpolation:true}:{}) });
    const meta=await lr.metadata(true);
    const img=await lr.imageData();
    if(!img||!img.data) throw new Error('LibRaw returned no image');
    const c=meta.color_data||meta.color||{}; const rc=c.rgb_cam||[[1,0,0],[0,1,0],[0,0,1]];
    return { w:img.width, h:img.height, colors:img.colors, bits:img.bits, data:img.data,
      mat:[rc[0][0],rc[0][1],rc[0][2],rc[1][0],rc[1][1],rc[1][2],rc[2][0],rc[2][1],rc[2][2]],
      camMul:c.cam_mul, baseline:(c.dng_levels&&c.dng_levels.baseline_exposure>-10)?c.dng_levels.baseline_exposure:0,
      fullW:meta.width, fullH:meta.height, make:meta.make, model:meta.model, ms:performance.now()-t0, meta };
  } finally { lr.dispose(); }
}
window.decodeRaw=decodeRaw;
window.dispatchEvent(new Event('rawready'));
