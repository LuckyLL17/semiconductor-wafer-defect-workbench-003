import {useEffect,useMemo,useRef,useState} from 'react';
import './styles.css';

type Defect={id:string;x:number;y:number;size:number;kind:string;severity:string;score:number;review:string;note:string;step?:string;tool?:string;lot?:string};
type StageKey='incoming'|'clean'|'etch'|'aoi';
type GenealogyNode={stage:string;entity:string;at:string};
type RelatedLot={lot:string;chamber:string;yield:number;status:'normal'|'watch'|'hold'|string};
type Lineage={defect:Defect;genealogy:GenealogyNode[];relatedLots:RelatedLot[]};
type LineageState=
 |{status:'idle'}
 |{status:'loading';id:string}
 |{status:'notfound';id:string}
 |{status:'error';id:string;message:string}
 |{status:'ready';id:string;data:Lineage};

const api=async(url:string,init?:RequestInit)=>fetch(url,init).then(r=>r.json());

const STAGES:Array<{key:StageKey;label:string;match:string[];hint:string}>=[
 {key:'incoming',label:'来料',match:['来料批次','来料'],hint:'来料批次登记 / 供应商批次'},
 {key:'clean',label:'CLEAN',match:['clean'],hint:'湿法 / 干法清洁'},
 {key:'etch',label:'ETCH',match:['etch','刻蚀'],hint:'刻蚀工艺腔体'},
 {key:'aoi',label:'AOI',match:['aoi'],hint:'自动光学检测'},
];
const KIND_LABEL:Record<string,string>={particle:'颗粒 particle',scratch:'划痕 scratch',void:'空洞 void',edge:'边缘缺陷 edge',cluster:'缺陷簇 cluster'};
const SEVERITY_LABEL:Record<string,string>={high:'高',medium:'中',low:'低'};
const REVIEW_LABEL:Record<string,string>={unreviewed:'待复核',confirmed:'已确认',false_positive:'误报'};
const LOT_STATUS_LABEL:Record<string,string>={normal:'正常',watch:'观察',hold:'冻结'};

const fmtTime=(iso:string)=>{try{return new Date(iso).toLocaleString('zh-CN',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return iso}};

// 把后端返回的谱系节点映射到标准四阶段，缺数据的阶段返回 missing=true
function buildStages(genealogy:GenealogyNode[]|undefined){
 const rows=STAGES.map(s=>{
  const node=(genealogy??[]).find(g=>s.match.some(m=>g.stage.toLowerCase().includes(m.toLowerCase())));
  return{key:s.key,label:s.label,hint:s.hint,node};
 });
 const known=rows.filter(r=>r.node).map(r=>r.node!) as GenealogyNode[];
 const unknown=(genealogy??[]).filter(g=>!STAGES.some(s=>s.match.some(m=>g.stage.toLowerCase().includes(m.toLowerCase()))));
 const sorted=[...known,...unknown].sort((a,b)=>a.at.localeCompare(b.at));
 return{rows,sorted,missingCount:rows.filter(r=>!r.node).length};
}

export default function App(){
 const [tab,setTab]=useState('map');
 const [data,setData]=useState<any>();
 const [spatial,setSpatial]=useState<any>();
 const [win,setWin]=useState<any>();
 const [filter,setFilter]=useState('all');
 const [selected,setSelected]=useState<Defect>();

 // 缺陷谱系追踪
 const [defectOptions,setDefectOptions]=useState<Defect[]>([]);
 const [lineageInput,setLineageInput]=useState('D-001');
 const [lineage,setLineage]=useState<LineageState>({status:'idle'});
 const lineageReq=useRef(0);

 useEffect(()=>{
  api('/api/wafer/current').then(setData);
  api('/api/analysis/spatial').then(setSpatial);
  api('/api/analysis/process-window').then(setWin);
 },[]);

 const defects=useMemo(()=>spatial?.clusters??[],[spatial]);
 const review=async(review:string)=>{
  if(!selected)return;
  await api(`/api/defects/${selected.id}/review`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({review})});
  setSelected({...selected,review});
 };

 // 进入谱系页时拉取缺陷编号列表，供输入建议
 const loadDefectOptions=()=>{
  if(defectOptions.length)return;
  api('/api/defects').then((rows:Defect[])=>{if(Array.isArray(rows))setDefectOptions(rows)}).catch(()=>{});
 };
 const openLineageTab=(id?:string)=>{
  setTab('lineage');
  loadDefectOptions();
  if(id){setLineageInput(id);loadLineage(id);}
  else if(lineage.status==='idle'){loadLineage();}
 };

 // 每次切换缺陷编号都会重新请求谱系；过期响应通过 reqId 丢弃
 const loadLineage=(rawId?:string)=>{
  const id=(rawId??lineageInput).trim();
  if(!id){setLineage({status:'idle'});return}
  const reqId=++lineageReq.current;
  setLineage({status:'loading',id});
  Promise.all([
   fetch(`/api/defects/${encodeURIComponent(id)}`).then(async r=>({ok:r.ok,body:await r.json()})),
   fetch(`/api/traceability/${encodeURIComponent(id)}`).then(async r=>({ok:r.ok,body:await r.json()})),
  ]).then(([def,trace])=>{
   if(reqId!==lineageReq.current)return;
   if(!def.ok||def.body?.error==='defect_not_found'||!trace.ok||trace.body?.error==='defect_not_found'||!trace.body?.defect){
    setLineage({status:'notfound',id});return;
   }
   setLineage({status:'ready',id,data:{defect:{...def.body,...(trace.body.defect??{})},genealogy:Array.isArray(trace.body.genealogy)?trace.body.genealogy:[],relatedLots:Array.isArray(trace.body.relatedLots)?trace.body.relatedLots:[]}});
  }).catch(err=>{
   if(reqId!==lineageReq.current)return;
   setLineage({status:'error',id,message:err?.message??'网络或服务异常'});
  });
 };

 const submitLineage=(e:React.FormEvent)=>{e.preventDefault();loadLineage()};

 return <main>
  <header>
   <div>
    <span className="eyebrow">FAB PROCESS INTELLIGENCE / LOT REVIEW</span>
    <h1>晶圆缺陷空间分布与工艺窗口分析工作台</h1>
    <p>晶圆 {data?.wafer?.id??'加载中'} · {data?.wafer?.product} · {data?.wafer?.layer}</p>
   </div>
   <div className="status">在线 · 数据质量 98.4%</div>
  </header>
  <nav>{[['map','空间缺陷地图'],['window','工艺窗口'],['review','缺陷复核'],['lineage','缺陷谱系追踪']].map(([id,label])=>
   <button key={id} className={tab===id?'active':''} onClick={()=>id==='lineage'?openLineageTab():setTab(id)}>{label}</button>
  )}</nav>
  {data&&<section className="metrics">
   <Metric label="缺陷总数" value={data.summary.defectCount}/>
   <Metric label="高风险" value={data.summary.highRisk}/>
   <Metric label="聚类" value={data.summary.clusterCount}/>
   <Metric label="已确认" value={data.summary.confirmed}/>
  </section>}
  {tab==='map'&&<section className="grid2">
   <div className="panel waferPanel">
    <div className="panelHead"><h2>300mm 晶圆缺陷分布</h2><span>自动检测 + 空间聚类</span></div>
    <svg viewBox="0 0 100 100" className="wafer">
     <circle cx="50" cy="50" r="47"/><circle cx="50" cy="50" r="42" className="notch"/>
     {spatial&&Array.from({length:48},(_,i)=><circle key={i} cx={50+Math.cos(i*1.73)*(35+(i%7)*12)+(i%3)*3} cy={50+Math.sin(i*1.73)*(35+(i%7)*12)} r={.8+(i%6)*.2} className={i%13===0?'high':i%4===0?'medium':'low'} onClick={()=>setSelected({id:`D-${String(i+1).padStart(3,'0')}`,x:0,y:0,size:0,kind:'particle',severity:i%13===0?'high':i%4===0?'medium':'low',score:.8,review:'unreviewed',note:'候选缺陷'})}/>)}
    </svg>
    <div className="legend"><span className="dot high"/>高风险 <span className="dot medium"/>中风险 <span className="dot low"/>低风险</div>
   </div>
   <div className="panel">
    <div className="panelHead"><h2>空间热点聚类</h2><span>按网格与线性缺陷聚类</span></div>
    {defects.slice(0,8).map((c:any)=><div className="cluster" key={c.id}>
     <div><b>{c.id}</b><small>{c.kind} · {c.tool}</small></div>
     <strong>{c.count} <small>点</small></strong>
     <i className={c.maxSeverity}>{c.maxSeverity}</i>
    </div>)}
   </div>
  </section>}
  {tab==='window'&&<section className="grid2">
   <div className="panel">
    <div className="panelHead"><h2>工艺窗口与设备关联</h2><span>按设备统计实际批次</span></div>
    {win?.window.map((x:any)=><div className="windowRow" key={x.tool}>
     <b>{x.tool}</b><span>平均良率 {x.meanYield}%</span><span>温度 {x.temperature.min}—{x.temperature.max}°C</span><span>压力 {x.pressure.min}—{x.pressure.max} Torr</span><em>{x.recommended.length?'推荐窗口':'无稳定窗口'}</em>
    </div>)}
   </div>
   <div className="panel">
    <div className="panelHead"><h2>因子相关性</h2><span>跨批次分析</span></div>
    {win?.correlations.map((x:any)=><div className="corr" key={x.factor}>
     <div><b>{x.factor} → {x.metric}</b><small>{x.interpretation}</small></div>
     <strong className={x.coefficient<0?'negative':''}>{x.coefficient}</strong>
    </div>)}
   </div>
  </section>}
  {tab==='review'&&<section className="grid2">
   <div className="panel">
    <div className="panelHead"><h2>缺陷复核队列</h2>
     <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部</option><option value="high">高风险</option><option value="medium">中风险</option></select>
    </div>
    {Array.from({length:12},(_,i)=>({id:`D-${String(i+1).padStart(3,'0')}`,x:0,y:0,size:0,kind:i%3?'particle':'scratch',severity:i%4===0?'high':'medium',score:.72+i*.01,review:'unreviewed',note:'等待工程师确认'})).filter(d=>filter==='all'||d.severity===filter).map(d=>
     <div className="defectRow" key={d.id} onClick={()=>setSelected(d)}>
      <b>{d.id}</b><span>{d.kind}</span><span className={d.severity}>{d.severity}</span><span>置信度 {d.score.toFixed(2)}</span>
     </div>)}
   </div>
   <div className="panel detail">
    {selected?<><span className="eyebrow">DEFECT DETAIL / {selected.id}</span>
     <h2>{selected.kind} 缺陷候选</h2>
     <p>检测置信度 {selected.score.toFixed(2)}，当前等级 {selected.severity}{selected.review!=='unreviewed'&&` · 复核状态：${REVIEW_LABEL[selected.review]??selected.review}`}</p>
     <textarea defaultValue={selected.note}/>
     <div className="actions">
      <button onClick={()=>review('confirmed')}>确认缺陷</button>
      <button className="ghost" onClick={()=>review('false_positive')}>标记误报</button>
      <button className="outline" onClick={()=>openLineageTab(selected.id)}>查看缺陷谱系 →</button>
     </div>
    </>:<div className="empty">选择一个缺陷查看检测证据与复核操作</div>}
   </div>
  </section>}
  {tab==='lineage'&&<LineageView input={lineageInput} setInput={setLineageInput} onSubmit={submitLineage} state={lineage} onRetry={()=>loadLineage()} onPick={(id)=>{setLineageInput(id);loadLineage(id)}} options={defectOptions}/>}
 </main>;
}

function LineageView({input,setInput,onSubmit,state,onRetry,onPick,options}:{
 input:string;setInput:(v:string)=>void;onSubmit:(e:React.FormEvent)=>void;
 state:LineageState;onRetry:()=>void;onPick:(id:string)=>void;options:Defect[];
}){
 return <section className="lineage">
  <div className="panel lineageSearch">
   <div className="panelHead"><h2>缺陷谱系追踪</h2><span>输入缺陷编号，加载真实属性 · 工艺节点 · 同设备批次</span></div>
   <form className="lineageForm" onSubmit={onSubmit}>
    <input list="defect-ids" value={input} onChange={e=>setInput(e.target.value)} placeholder="缺陷编号，如 D-001" aria-label="缺陷编号"/>
    <datalist id="defect-ids">{options.map(d=><option key={d.id} value={d.id}>{d.kind} · {d.severity}</option>)}</datalist>
    <button type="submit" disabled={state.status==='loading'}>{state.status==='loading'?'加载中…':'加载谱系'}</button>
   </form>
   <div className="chips">
    <span>示例：</span>
    {[['D-001','完整 / 无同设备批次'],['D-002','缺 CLEAN'],['D-003','缺 AOI'],['D-005','缺来料'],['D-008','缺 ETCH'],['D-999','不存在']].map(([id,desc])=>
     <button key={id} type="button" className={`chip ${state.status!=='idle'&&'id' in state&&state.id===id?'on':''}`} onClick={()=>onPick(id)} title={desc}>{id}</button>)}
   </div>
  </div>

  {state.status==='idle'&&<div className="panel empty wide">输入缺陷编号并点击「加载谱系」，或选择示例缺陷编号。</div>}
  {state.status==='loading'&&<div className="panel empty wide">正在加载缺陷 {state.id} 的谱系数据…</div>}
  {state.status==='notfound'&&<div className="panel statePanel wide">
   <h2>未找到缺陷 {state.id}</h2>
   <p>缺陷编号不存在，或尚未同步到缺陷库。请核对编号后重试。</p>
   <button onClick={onRetry}>重新加载</button>
  </div>}
  {state.status==='error'&&<div className="panel statePanel wide">
   <h2>谱系请求失败</h2>
   <p>缺陷 {state.id}：{state.message}。请检查后端服务（端口 6201）后重试。</p>
   <button onClick={onRetry}>重试</button>
  </div>}
  {state.status==='ready'&&<LineageResult lineage={state.data}/>}
 </section>;
}

function LineageResult({lineage}:{lineage:Lineage}){
 const d=lineage.defect;
 const {rows,sorted,missingCount}=buildStages(lineage.genealogy);
 return <section className="grid2 lineageGrid">
  <div className="panel">
   <div className="panelHead"><h2>缺陷属性</h2><span className="eyebrow">{d.id}</span></div>
   <div className="attrGrid">
    <Attr label="缺陷编号" value={d.id}/>
    <Attr label="类型" value={KIND_LABEL[d.kind]??d.kind}/>
    <Attr label="严重度" value={SEVERITY_LABEL[d.severity]??d.severity} pill={d.severity}/>
    <Attr label="检测置信度" value={d.score!=null?`${d.score}`:'—'}/>
    <Attr label="复核状态" value={REVIEW_LABEL[d.review]??d.review??'—'} pill={`rv-${d.review}`}/>
    <Attr label="坐标 (x, y)" value={d.x!=null?`${d.x}, ${d.y}`:'—'}/>
    <Attr label="尺寸" value={d.size!=null?`${d.size} μm`:'—'}/>
    <Attr label="检出工序" value={d.step??'—'}/>
    <Attr label="关联设备" value={d.tool??'—'}/>
    <Attr label="所属批次" value={d.lot??'—'}/>
   </div>
   {d.note&&<p className="note">备注：{d.note}</p>}

   <div className="panelHead sub"><h2>工艺节点谱系</h2><span>{missingCount?`${missingCount} 个阶段无记录`:'四个阶段记录完整'} · 共 {sorted.length} 条</span></div>
   <ol className="timeline">
    {rows.map(r=>{
     const g=r.node;
     const order=g?sorted.findIndex(s=>s.at===g.at&&s.entity===g.entity&&s.stage===g.stage):-1;
     return <li key={r.key} className={g?'':'missing'}>
      <i className="node"/>
      <div className="tlBody">
       <div className="tlHead"><b>{r.label}</b>{g?<span>{fmtTime(g.at)}</span>:<em>阶段数据缺失</em>}</div>
       <small>{g?`${g.stage} · ${g.entity}`:r.hint}</small>
       {g&&order>=0&&<em className="order">#{order+1}</em>}
      </div>
     </li>;
    })}
   </ol>
   {lineage.genealogy.length>0&&missingCount>0&&<p className="note">说明：缺失阶段表示该缺陷在对应工序未采集到履历记录，不代表缺陷未经过该工序。</p>}
  </div>

  <div className="panel">
   <div className="panelHead"><h2>同设备影响批次</h2><span>{lineage.relatedLots.length?`${lineage.relatedLots.length} 个批次 · 设备 ${d.tool??'—'}`:'无相关批次'}</span></div>
   {lineage.relatedLots.length===0
    ?<div className="empty soft">未检索到与设备 {d.tool??'—'} 关联的其他批次，可能为新设备首件或批次履历未归档。</div>
    :<table className="lotTable">
      <thead><tr><th>批次</th><th>腔体</th><th>良率</th><th>状态</th></tr></thead>
      <tbody>{lineage.relatedLots.map(l=>
       <tr key={l.lot}><td><b>{l.lot}</b></td><td>{l.chamber}</td>
        <td className={l.yield>=94?'yieldOk':'yieldLow'}>{l.yield}%</td>
        <td><span className={`lotStatus ${l.status}`}>{LOT_STATUS_LABEL[l.status]??l.status}</span></td></tr>)}
      </tbody>
     </table>}
  </div>
 </section>;
}

function Attr({label,value,pill}:{label:string;value:string;pill?:string}){
 return <div className="attr"><small>{label}</small>{pill?<span className={`pill ${pill}`}>{value}</span>:<strong>{value}</strong>}</div>;
}
function Metric({label,value}:{label:string;value:any}){return <div className="metric"><small>{label}</small><strong>{value}</strong></div>;}
