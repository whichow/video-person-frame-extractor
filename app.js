const $=s=>document.querySelector(s);
const el={file:$("#fileInput"),url:$("#urlInput"),loadUrl:$("#loadUrl"),video:$("#video"),detect:$("#detectCanvas"),full:$("#fullCanvas"),mode:$("#scanMode"),sceneInterval:$("#sceneInterval"),sceneThreshold:$("#sceneThreshold"),maxGap:$("#maxGap"),interval:$("#interval"),confidence:$("#confidence"),minArea:$("#minArea"),dup:$("#dupThreshold"),max:$("#maxFrames"),start:$("#start"),cancel:$("#cancel"),progress:$("#progress"),status:$("#status"),summary:$("#summary"),gallery:$("#gallery"),badge:$("#modelBadge"),json:$("#downloadJson"),sheet:$("#downloadSheet"),zip:$("#downloadZip")};
let model=null,results=[],stopFlag=false,sourceLabel="",processing=false,lastRunStats=null;
const setStatus=m=>el.status.textContent=m;
const fmt=t=>{const m=Math.floor(t/60),s=(t%60).toFixed(2).padStart(5,"0");return `${m}:${s}`};
const saveBlob=(blob,name)=>{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
const canvasBlob=(canvas,type="image/jpeg",quality=.92)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("无法生成图片")),type,quality));
function resetResults(){for(const r of results)URL.revokeObjectURL(r.url);results=[];el.gallery.innerHTML="";el.summary.textContent="尚未处理";el.json.disabled=el.sheet.disabled=el.zip.disabled=true}
function waitMetadata(){if(el.video.readyState>=1&&Number.isFinite(el.video.duration))return Promise.resolve();return new Promise((resolve,reject)=>{const ok=()=>{cleanup();resolve()},bad=()=>{cleanup();reject(new Error("视频载入失败"))},cleanup=()=>{el.video.removeEventListener("loadedmetadata",ok);el.video.removeEventListener("error",bad)};el.video.addEventListener("loadedmetadata",ok);el.video.addEventListener("error",bad)})}
function seekTo(t){return new Promise((resolve,reject)=>{let done=false;const target=Math.max(0,Math.min(t,Math.max(0,el.video.duration-.001)));const finish=()=>{if(done)return;done=true;clearTimeout(timer);el.video.removeEventListener("seeked",finish);resolve()};const timer=setTimeout(()=>{if(done)return;done=true;el.video.removeEventListener("seeked",finish);reject(new Error("跳转视频帧超时"))},6000);el.video.addEventListener("seeked",finish);if(Math.abs(el.video.currentTime-target)<.001&&el.video.readyState>=2)setTimeout(finish,0);else el.video.currentTime=target})}
(async()=>{try{model=await cocoSsd.load({base:"lite_mobilenet_v2"});el.badge.textContent="人物模型已就绪";setStatus("请选择视频。")}catch(e){el.badge.textContent="模型加载失败";setStatus("模型加载失败："+e.message)}})();
el.file.addEventListener("change",()=>{const f=el.file.files?.[0];if(!f)return;resetResults();sourceLabel=f.name;el.video.removeAttribute("crossorigin");el.video.src=URL.createObjectURL(f);el.video.load();setStatus("已载入本地视频："+f.name)});
el.loadUrl.addEventListener("click",()=>{const u=el.url.value.trim();if(!u)return;resetResults();sourceLabel=u;el.video.crossOrigin="anonymous";el.video.src=u;el.video.load();setStatus("正在载入 URL；目标站点必须允许浏览器跨域读取视频。")});
function sharpness(canvas){const ctx=canvas.getContext("2d",{willReadFrequently:true}),{data,width,height}=ctx.getImageData(0,0,canvas.width,canvas.height);let sum=0,n=0;for(let y=0;y<height-4;y+=4){for(let x=0;x<width-4;x+=4){const i=(y*width+x)*4,r=.299*data[i]+.587*data[i+1]+.114*data[i+2],ir=(y*width+x+4)*4,id=((y+4)*width+x)*4,rr=.299*data[ir]+.587*data[ir+1]+.114*data[ir+2],rd=.299*data[id]+.587*data[id+1]+.114*data[id+2];sum+=Math.abs(r-rr)+Math.abs(r-rd);n+=2}}return n?sum/n:0}
function dHash(canvas,bbox){const [bx,by,bw,bh]=bbox,sx=Math.max(0,bx),sy=Math.max(0,by),sw=Math.max(2,Math.min(canvas.width-sx,bw)),sh=Math.max(2,Math.min(canvas.height-sy,bh));const c=document.createElement("canvas");c.width=9;c.height=8;const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(canvas,sx,sy,sw,sh,0,0,9,8);const d=x.getImageData(0,0,9,8).data;let bits="";for(let y=0;y<8;y++){for(let col=0;col<8;col++){const a=(y*9+col)*4,b=(y*9+col+1)*4,ga=.299*d[a]+.587*d[a+1]+.114*d[a+2],gb=.299*d[b]+.587*d[b+1]+.114*d[b+2];bits+=ga>gb?"1":"0"}}return bits}
function hamming(a,b){let d=0;for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])d++;return d+Math.abs(a.length-b.length)}
async function captureOriginal(){el.full.width=el.video.videoWidth;el.full.height=el.video.videoHeight;el.full.getContext("2d").drawImage(el.video,0,0);return canvasBlob(el.full)}
async function considerFrame(meta,threshold,maxFrames){let dupIndex=-1,bestDist=999;for(let i=0;i<results.length;i++){const d=hamming(meta.hash,results[i].hash);if(d<=threshold&&d<bestDist){bestDist=d;dupIndex=i}}if(dupIndex>=0&&results[dupIndex].score>=meta.score)return false;const blob=await captureOriginal(),item={...meta,blob,url:URL.createObjectURL(blob)};if(dupIndex>=0){URL.revokeObjectURL(results[dupIndex].url);results[dupIndex]=item}else results.push(item);if(results.length>maxFrames){results.sort((a,b)=>b.score-a.score);const removed=results.splice(maxFrames);removed.forEach(r=>URL.revokeObjectURL(r.url))}results.sort((a,b)=>a.time-b.time);return true}
function renderGallery(){el.gallery.innerHTML="";for(const [i,r] of results.entries()){const card=document.createElement("article");card.className="card";card.innerHTML=`<img src="${r.url}" alt="人物关键帧"><div class="meta"><strong>#${String(i+1).padStart(3,"0")} · ${fmt(r.time)}</strong><small>${r.people.length} 人 · 置信度 ${(r.confidence*100).toFixed(0)}% · 评分 ${r.score.toFixed(3)}</small><button>下载此帧</button></div>`;card.querySelector("button").onclick=()=>saveBlob(r.blob,`frame_${String(i+1).padStart(3,"0")}_${r.time.toFixed(2)}s.jpg`);el.gallery.appendChild(card)}el.summary.textContent=`已保留 ${results.length} 张人物关键帧`;const has=results.length>0;el.json.disabled=el.sheet.disabled=el.zip.disabled=!has}
function manifest(){return{source:sourceLabel,generated_at:new Date().toISOString(),detector:"TensorFlow.js COCO-SSD lite_mobilenet_v2",run_stats:lastRunStats,video:{width:el.video.videoWidth,height:el.video.videoHeight,duration:el.video.duration},frames:results.map((r,i)=>({index:i+1,timestamp:r.time,score:r.score,sharpness:r.sharpness,confidence:r.confidence,people:r.people}))}}
function sceneSignature(canvas){
 const d=canvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data,out=new Uint8Array(canvas.width*canvas.height);
 for(let i=0,j=0;i<d.length;i+=4,j++)out[j]=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
 return out
}
function sceneDifference(a,b){if(!a||!b||a.length!==b.length)return 1;let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/(a.length*255)}
function syncModeUI(){const adaptive=el.mode.value==="adaptive";el.sceneInterval.disabled=!adaptive;el.sceneThreshold.disabled=!adaptive;el.maxGap.disabled=!adaptive;el.interval.disabled=adaptive}
el.mode.addEventListener("change",syncModeUI);syncModeUI();
async function detectCurrentFrame(t,params){
 const {ctx,scale,confidence,minArea,dupThreshold,maxFrames}=params;
 ctx.drawImage(el.video,0,0,el.detect.width,el.detect.height);
 const predictions=await model.detect(el.detect);
 const people=predictions.filter(p=>p.class==="person"&&p.score>=confidence&&(p.bbox[2]*p.bbox[3])/(el.detect.width*el.detect.height)>=minArea);
 if(!people.length)return{hit:false,changed:false};
 const largest=[...people].sort((a,b)=>b.bbox[2]*b.bbox[3]-a.bbox[2]*a.bbox[3])[0],conf=Math.max(...people.map(p=>p.score)),area=Math.max(...people.map(p=>(p.bbox[2]*p.bbox[3])/(el.detect.width*el.detect.height))),shp=sharpness(el.detect),score=.5*conf+.3*Math.min(1,area*4)+.2*Math.min(1,shp/25),hash=dHash(el.detect,largest.bbox),mapped=people.map(p=>({confidence:+p.score.toFixed(5),bbox:p.bbox.map(v=>+(v/scale).toFixed(2))}));
 const changed=await considerFrame({time:+t.toFixed(3),score:+score.toFixed(6),sharpness:+shp.toFixed(4),confidence:+conf.toFixed(6),people:mapped,hash},dupThreshold,maxFrames);
 if(changed)renderGallery();
 return{hit:true,changed}
}
async function processVideo(){
 if(processing)return;if(!model){setStatus("人物模型尚未就绪。");return}
 try{await waitMetadata()}catch(e){setStatus(e.message);return}
 if(!Number.isFinite(el.video.duration)||el.video.duration<=0){setStatus("无法读取视频时长。");return}
 resetResults();processing=true;stopFlag=false;el.start.disabled=true;el.cancel.disabled=false;el.progress.value=0;el.video.pause();
 const mode=el.mode.value,confidence=Math.min(.99,Math.max(.1,Number(el.confidence.value)||.55)),minArea=Math.max(0,Number(el.minArea.value)||0),dupThreshold=Math.max(0,Number(el.dup.value)||8),maxFrames=Math.max(1,Number(el.max.value)||100);
 const scale=Math.min(1,768/el.video.videoWidth);el.detect.width=Math.max(1,Math.round(el.video.videoWidth*scale));el.detect.height=Math.max(1,Math.round(el.video.videoHeight*scale));const ctx=el.detect.getContext("2d",{willReadFrequently:true});
 const params={ctx,scale,confidence,minArea,dupThreshold,maxFrames};let sceneSamples=0,detectorRuns=0,hitSamples=0;
 try{
  if(mode==="adaptive"){
   const pre=Math.max(.25,Number(el.sceneInterval.value)||1),threshold=Math.min(.5,Math.max(.02,Number(el.sceneThreshold.value)||.08)),maxGap=Math.max(2,Number(el.maxGap.value)||10),scene=document.createElement("canvas");
   scene.width=32;scene.height=Math.max(18,Math.round(32*el.video.videoHeight/el.video.videoWidth));
   const sctx=scene.getContext("2d",{willReadFrequently:true});let previous=null,lastDetect=-Infinity;
   for(let t=0;t<el.video.duration;t+=pre){
    if(stopFlag)break;await seekTo(t);sctx.drawImage(el.video,0,0,scene.width,scene.height);const sig=sceneSignature(scene),diff=sceneDifference(previous,sig),candidate=!previous||diff>=threshold||(t-lastDetect)>=maxGap;
    sceneSamples++;previous=sig;
    if(candidate){lastDetect=t;detectorRuns++;const r=await detectCurrentFrame(t,params);if(r.hit)hitSamples++}
    el.progress.value=Math.min(1,(t+pre)/el.video.duration);setStatus(`自适应扫描 ${fmt(t)} / ${fmt(el.video.duration)} · 预扫 ${sceneSamples} · AI检测 ${detectorRuns} · 命中人物 ${hitSamples} · 保留 ${results.length} 张`)
   }
  }else{
   const interval=Math.max(.1,Number(el.interval.value)||1);
   for(let t=0;t<el.video.duration;t+=interval){
    if(stopFlag)break;await seekTo(t);sceneSamples++;detectorRuns++;const r=await detectCurrentFrame(t,params);if(r.hit)hitSamples++;el.progress.value=Math.min(1,(t+interval)/el.video.duration);setStatus(`固定扫描 ${fmt(t)} / ${fmt(el.video.duration)} · AI检测 ${detectorRuns} · 命中人物 ${hitSamples} · 保留 ${results.length} 张`)
   }
  }
  lastRunStats={mode,scene_samples:sceneSamples,detector_runs:detectorRuns,person_hits:hitSamples,retained_frames:results.length};
  renderGallery();setStatus(stopFlag?`已停止：AI检测 ${detectorRuns} 次，保留 ${results.length} 张人物关键帧。`:`完成：AI检测 ${detectorRuns} 次，命中人物 ${hitSamples} 次，保留 ${results.length} 张关键帧。`)
 }catch(e){console.error(e);setStatus("处理失败："+e.message+"。如果使用 URL，请改用本地视频文件测试，部分站点禁止跨域读取视频帧。")}finally{processing=false;el.start.disabled=false;el.cancel.disabled=true}
}
el.start.addEventListener("click",processVideo);el.cancel.addEventListener("click",()=>{stopFlag=true;el.cancel.disabled=true;setStatus("正在停止…")});
async function makeContactSheet(){if(!results.length)throw new Error("没有可生成的关键帧");const cols=Math.min(4,results.length),cellW=320,imgH=180,labelH=32,rows=Math.ceil(results.length/cols),c=document.createElement("canvas");c.width=cols*cellW;c.height=rows*(imgH+labelH);const x=c.getContext("2d");x.fillStyle="#0b1020";x.fillRect(0,0,c.width,c.height);for(let i=0;i<results.length;i++){const img=await createImageBitmap(results[i].blob),cx=(i%cols)*cellW,cy=Math.floor(i/cols)*(imgH+labelH),ratio=Math.min(cellW/img.width,imgH/img.height),w=img.width*ratio,h=img.height*ratio;x.fillStyle="#050811";x.fillRect(cx,cy,cellW,imgH);x.drawImage(img,cx+(cellW-w)/2,cy+(imgH-h)/2,w,h);img.close();x.fillStyle="#e8eef7";x.font="14px system-ui";x.fillText(`#${String(i+1).padStart(3,"0")}  ${fmt(results[i].time)}  score ${results[i].score.toFixed(3)}`,cx+10,cy+imgH+21)}return canvasBlob(c,"image/jpeg",.9)}
el.json.addEventListener("click",()=>saveBlob(new Blob([JSON.stringify(manifest(),null,2)],{type:"application/json"}),"people.json"));
el.sheet.addEventListener("click",async()=>{try{setStatus("正在生成缩略图总览…");saveBlob(await makeContactSheet(),"contact-sheet.jpg");setStatus("缩略图总览已生成。")}catch(e){setStatus(e.message)}});
el.zip.addEventListener("click",async()=>{if(!results.length)return;try{el.zip.disabled=true;const zip=new JSZip(),folder=zip.folder("frames");for(let i=0;i<results.length;i++){const r=results[i];folder.file(`frame_${String(i+1).padStart(3,"0")}_${r.time.toFixed(2)}s.jpg`,r.blob)}zip.file("people.json",JSON.stringify(manifest(),null,2));zip.file("contact-sheet.jpg",await makeContactSheet());const out=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}},m=>setStatus(`正在打包 ZIP：${m.percent.toFixed(0)}%`));saveBlob(out,"person-frames.zip");setStatus(`ZIP 已生成，共 ${results.length} 张关键帧。`)}catch(e){setStatus("打包失败："+e.message)}finally{el.zip.disabled=!results.length}});
el.video.addEventListener("error",()=>{if(sourceLabel)setStatus("视频无法载入。若使用网络 URL，可能是格式、鉴权或 CORS 限制；可先下载视频后选择本地文件。")});
window.addEventListener("beforeunload",()=>results.forEach(r=>URL.revokeObjectURL(r.url)));
