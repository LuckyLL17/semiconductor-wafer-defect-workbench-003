import {useEffect,useMemo,useRef,useState} from 'react';import './styles.css';
type Defect={id:string;x:number;y:number;size:number;kind:string;severity:string;score:number;step?:string;tool?:string;lot?:string;review:string;note:string};
type GenealogyStage={stage:string;label:string;entity:string|null;at:string|null;skipped?:boolean;reason?:string};
type RelatedLot={run:string;lot:string;chamber:string;recipe:string;yield:number;status:'normal'|'watch'|'hold'};
type TraceData={defect:Defect;genealogy:GenealogyStage[];relatedLots:RelatedLot[]};
type LoadStatus='idle'|'loading'|'ready'|'notfound'|'failed';
const api=async(url:string,init?:RequestInit)=>fetch(url,init).then(r=>r.json());
const KIND_LABEL:Record<string,string>={particle:'颗粒',scratch:'划痕',void:'空洞',edge:'边缘',cluster:'簇群'};
const SEVERITY_LABEL:Record<string,string>={low:'低风险',medium:'中风险',high:'高风险'};
const REVIEW_LABEL:Record<string,string>={unreviewed:'待复核',confirmed:'已确认',false_positive:'误报'};
const LOT_STATUS_LABEL:Record<string,string>={normal:'正常',watch:'关注',hold:'冻结'};
const formatTime=(at:string|null)=>{if(!at)return'—';const d=new Date(at);return Number.isNaN(d.getTime())?at:d.toLocaleString('zh-CN',{hour12:false});};
export default function App(){const [tab,setTab]=useState('map');const [data,setData]=useState<any>();const [spatial,setSpatial]=useState<any>();const [window,setWindow]=useState<any>();const [filter,setFilter]=useState('all');const [selected,setSelected]=useState<Defect>();const [genealogyId,setGenealogyId]=useState('');
useEffect(()=>{api('/api/wafer/current').then(setData);api('/api/analysis/spatial').then(setSpatial);api('/api/analysis/process-window').then(setWindow)},[]);
const defects=useMemo(()=>spatial?.clusters??[],[spatial]);const review=async(review:string)=>{if(!selected)return;await api(`/api/defects/${selected.id}/review`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({review})});setSelected({...selected,review})};
const openGenealogy=(id:string)=>{setGenealogyId(id);setTab('genealogy')};
return <main><header><div><span className="eyebrow">FAB PROCESS INTELLIGENCE / LOT REVIEW</span><h1>晶圆缺陷空间分布与工艺窗口分析工作台</h1><p>晶圆 {data?.wafer?.id??'加载中'} · {data?.wafer?.product} · {data?.wafer?.layer}</p></div><div className="status">在线 · 数据质量 98.4%</div></header><nav>{[['map','空间缺陷地图'],['window','工艺窗口'],['review','缺陷复核'],['genealogy','缺陷谱系追踪']].map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>{data&&<section className="metrics"><Metric label="缺陷总数" value={data.summary.defectCount}/><Metric label="高风险" value={data.summary.highRisk}/><Metric label="聚类" value={data.summary.clusterCount}/><Metric label="已确认" value={data.summary.confirmed}/></section>}{tab==='map'&&<section className="grid2"><div className="panel waferPanel"><div className="panelHead"><h2>300mm 晶圆缺陷分布</h2><span>自动检测 + 空间聚类</span></div><svg viewBox="0 0 100 100" className="wafer"><circle cx="50" cy="50" r="47"/><circle cx="50" cy="50" r="42" className="notch"/>{spatial&&Array.from({length:48},(_,i)=><circle key={i} cx={50+Math.cos(i*1.73)*(35+(i%7)*12)+(i%3)*3} cy={50+Math.sin(i*1.73)*(35+(i%7)*12)} r={.8+(i%6)*.2} className={i%13===0?'high':i%4===0?'medium':'low'} onClick={()=>setSelected({id:`D-${String(i+1).padStart(3,'0')}`,x:0,y:0,size:0,kind:'particle',severity:i%13===0?'high':i%4===0?'medium':'low',score:.8,review:'unreviewed',note:'候选缺陷'})}/>)}</svg><div className="legend"><span className="dot high"/>高风险 <span className="dot medium"/>中风险 <span className="dot low"/>低风险</div></div><div className="panel"><div className="panelHead"><h2>空间热点聚类</h2><span>按网格与线性缺陷聚类</span></div>{defects.slice(0,8).map((c:any)=><div className="cluster" key={c.id}><div><b>{c.id}</b><small>{c.kind} · {c.tool}</small></div><strong>{c.count} <small>点</small></strong><i className={c.maxSeverity}>{c.maxSeverity}</i></div>)}</div></section>}{tab==='window'&&<section className="grid2"><div className="panel"><div className="panelHead"><h2>工艺窗口与设备关联</h2><span>按设备统计实际批次</span></div>{window?.window.map((x:any)=><div className="windowRow" key={x.tool}><b>{x.tool}</b><span>平均良率 {x.meanYield}%</span><span>温度 {x.temperature.min}—{x.temperature.max}°C</span><span>压力 {x.pressure.min}—{x.pressure.max} Torr</span><em>{x.recommended.length?'推荐窗口':'无稳定窗口'}</em></div>)}</div><div className="panel"><div className="panelHead"><h2>因子相关性</h2><span>跨批次分析</span></div>{window?.correlations.map((x:any)=><div className="corr" key={x.factor}><div><b>{x.factor} → {x.metric}</b><small>{x.interpretation}</small></div><strong className={x.coefficient<0?'negative':''}>{x.coefficient}</strong></div>)}</div></section>}{tab==='review'&&<section className="grid2"><div className="panel"><div className="panelHead"><h2>缺陷复核队列</h2><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部</option><option value="high">高风险</option><option value="medium">中风险</option></select></div>{Array.from({length:12},(_,i)=>({id:`D-${String(i+1).padStart(3,'0')}`,x:0,y:0,size:0,kind:i%3?'particle':'scratch',severity:i%4===0?'high':'medium',score:.72+i*.01,review:'unreviewed',note:'等待工程师确认'})).filter(d=>filter==='all'||d.severity===filter).map(d=><div className={`defectRow${selected?.id===d.id?' selected':''}`} key={d.id} onClick={()=>setSelected(d)}><b>{d.id}</b><span>{d.kind}</span><span className={d.severity}>{d.severity}</span><span>置信度 {d.score.toFixed(2)}</span></div>)}</div><div className="panel detail">{selected?<><span className="eyebrow">DEFECT DETAIL / {selected.id}</span><h2>{selected.kind} 缺陷候选</h2><p>检测置信度 {selected.score.toFixed(2)}，当前等级 {selected.severity}</p><textarea defaultValue={selected.note}/><div className="actions"><button onClick={()=>review('confirmed')}>确认缺陷</button><button className="ghost" onClick={()=>review('false_positive')}>标记误报</button><button className="ghost" onClick={()=>openGenealogy(selected.id)}>缺陷谱系追踪 →</button></div></>:<div className="empty">选择一个缺陷查看检测证据与复核操作</div>}</div></section>}{tab==='genealogy'&&<GenealogyTab defectId={genealogyId}/>}</main>}
function Metric({label,value}:{label:string;value:any}){return <div className="metric"><small>{label}</small><strong>{value}</strong></div>}
function GenealogyTab({defectId}:{defectId:string}){const [input,setInput]=useState(defectId);const [status,setStatus]=useState<LoadStatus>(defectId?'loading':'idle');const [trace,setTrace]=useState<TraceData>();const [errorMsg,setErrorMsg]=useState('');const [activeId,setActiveId]=useState(defectId||'');const [confirmed,setConfirmed]=useState<Defect[]>([]);const reqSeq=useRef(0);
const load=async(raw:string)=>{const id=raw.trim().toUpperCase();if(!id)return;setInput(id);setActiveId(id);setStatus('loading');setTrace(undefined);setErrorMsg('');const seq=++reqSeq.current;
try{const res=await fetch(`/api/traceability/${encodeURIComponent(id)}`);let body:any=null;try{body=await res.json()}catch{body=null}
if(seq!==reqSeq.current)return;
if(res.status===404||body?.error==='defect_not_found'){setStatus('notfound');return}
if(!res.ok||!body||body.error){setStatus('failed');setErrorMsg(body?.error?`服务返回错误：${body.error}`:`请求失败（HTTP ${res.status}）`);return}
setTrace(body);setStatus('ready');
}catch{if(seq!==reqSeq.current)return;setStatus('failed');setErrorMsg('无法连接谱系服务，请检查网络或稍后重试');}};
useEffect(()=>{api('/api/defects?review=confirmed').then((rows:Defect[])=>{if(Array.isArray(rows))setConfirmed(rows)}).catch(()=>undefined)},[]);
useEffect(()=>{if(defectId){setInput(defectId);load(defectId)}return()=>{reqSeq.current++}},[defectId]);
const orderedStages=trace?[...trace.genealogy].filter(s=>!s.skipped&&s.at).sort((a,b)=>String(a.at).localeCompare(String(b.at))).concat(trace.genealogy.filter(s=>s.skipped||!s.at)):[];
return (
  <section className="genealogy">
    <div className="panel">
      <div className="panelHead"><h2>缺陷谱系追踪</h2><span>输入缺陷编号，重新加载其完整工艺谱系</span></div>
      <form className="geneSearch" onSubmit={e=>{e.preventDefault();load(input)}}>
        <label>缺陷编号<input value={input} placeholder="例如 D-001" onChange={e=>setInput(e.target.value)}/></label>
        <button type="submit" disabled={status==='loading'}>{status==='loading'?'加载中…':'查询谱系'}</button>
        {activeId&&<span className="searchHint">当前谱系：<b>{activeId}</b></span>}
      </form>
      {confirmed.length>0&&<div className="chips"><span className="chipsLabel">已确认缺陷：</span>{confirmed.map(d=><button key={d.id} type="button" className={`chip${activeId===d.id?' active':''}`} onClick={()=>load(d.id)}>{d.id}</button>)}</div>}
    </div>
    {status==='idle'&&<div className="panel stateBox"><div className="stateIcon">⌕</div><h3>请输入缺陷编号</h3><p>质量工程师确认缺陷后，可在此追溯它经过的来料、清洁、刻蚀、AOI 工艺节点，以及同设备影响过的批次良率与状态。</p></div>}
    {status==='loading'&&<div className="panel stateBox"><div className="stateSpinner"/> <h3>正在加载缺陷 {activeId} 的谱系…</h3><p>正在获取真实缺陷属性、工艺节点与相关批次数据。</p></div>}
    {status==='notfound'&&<div className="panel stateBox error"><div className="stateIcon">⊘</div><h3>缺陷 {activeId} 不存在</h3><p>未在当前晶圆缺陷库中找到该编号，请确认编号后重新查询。</p><div className="actions"><button onClick={()=>load(input)}>重新查询</button></div></div>}
    {status==='failed'&&<div className="panel stateBox error"><div className="stateIcon">!</div><h3>谱系加载失败</h3><p>{errorMsg||'请求失败，请稍后重试。'}</p><div className="actions"><button onClick={()=>load(activeId)}>重试</button></div></div>}
    {status==='ready'&&trace&&<>
      <div className="panel">
        <div className="panelHead"><h2>缺陷属性 · {trace.defect.id}</h2><span className={`badge ${trace.defect.severity}`}>{SEVERITY_LABEL[trace.defect.severity]??trace.defect.severity}</span></div>
        <div className="propsGrid">
          <Prop label="缺陷类型" value={KIND_LABEL[trace.defect.kind]??trace.defect.kind}/>
          <Prop label="复核状态" value={REVIEW_LABEL[trace.defect.review]??trace.defect.review}/>
          <Prop label="检测置信度" value={trace.defect.score.toFixed(2)}/>
          <Prop label="尺寸 (μm)" value={String(trace.defect.size)}/>
          <Prop label="坐标 (x, y)" value={`${trace.defect.x}, ${trace.defect.y}`}/>
          <Prop label="归因工序" value={trace.defect.step??'—'}/>
          <Prop label="发现设备" value={trace.defect.tool??'—'}/>
          <Prop label="所属批次" value={trace.defect.lot??'—'}/>
        </div>
        <p className="noteBlock">备注：{trace.defect.note||'无'}</p>
      </div>
      <div className="grid2">
        <div className="panel">
          <div className="panelHead"><h2>工艺节点谱系</h2><span>按发生时间排列</span></div>
          <ol className="timeline">
            {orderedStages.map(s=><li key={s.stage} className={s.skipped||!s.at?'skipped':''}><span className="tlDot"/><div className="tlBody"><b>{s.label}</b>{s.skipped||!s.at?<small className="missing">未执行 / 阶段缺失{s.reason?`：${s.reason}`:''}</small>:<><small>{s.entity??'实体信息缺失'}</small><small className="tlTime">{formatTime(s.at)}</small></>}</div></li>)}
          </ol>
          {orderedStages.some(s=>s.skipped||!s.at)&&<p className="stageWarn">该缺陷的工艺阶段不完整，缺失节点已在时间线中标注。</p>}
        </div>
        <div className="panel">
          <div className="panelHead"><h2>同设备影响批次</h2><span>共 {trace.relatedLots.length} 个批次</span></div>
          {trace.relatedLots.length===0
            ? <div className="empty">无相关批次：该缺陷未进入刻蚀/AOI 设备，没有同设备影响记录。</div>
            : <table className="lotTable"><thead><tr><th>批次</th><th>设备运行</th><th>腔体</th><th>良率</th><th>状态</th></tr></thead>
              <tbody>{trace.relatedLots.map(r=><tr key={r.run}><td><b>{r.lot}</b><small>{r.recipe}</small></td><td>{r.run}</td><td>{r.chamber}</td><td className={r.yield<94?'yieldLow':''}>{r.yield}%</td><td><span className={`badge status-${r.status}`}>{LOT_STATUS_LABEL[r.status]??r.status}</span></td></tr>)}</tbody></table>}
        </div>
      </div>
    </>}
  </section>
);}
function Prop({label,value}:{label:string;value:string}){return <div className="prop"><small>{label}</small><strong>{value}</strong></div>}
