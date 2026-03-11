import { useState, useEffect, useCallback } from 'react'
import { isOPWallet } from '@btc-vision/transaction'
import { api, type FactoryInfo, type Proposal, type RelayerStatus } from './api'

const STATE_LABEL = ['PENDING', 'ACTIVE', 'SUCCEEDED', 'DEFEATED', 'EXECUTED', 'CANCELLED']

const C = {
  bg:'#0b0d12', bgCard:'#0f1118', bgElevated:'#161925',
  border:'#1c2030', borderMid:'#252c3e',
  text:'#dde1ec', textSub:'#6b7280', textDim:'#2e3347',
  accent:'#e8a930', accentBg:'#e8a93014', accentRing:'#e8a93030',
  green:'#34d399', greenBg:'#34d39910', greenRing:'#34d39930',
  red:'#f87171', redBg:'#f8717110', redRing:'#f8717130',
  blue:'#60a5fa',
}
const STATE_COLOR: Record<number,string> = {0:'#6b7280',1:'#e8a930',2:'#34d399',3:'#f87171',4:'#60a5fa',5:'#2e3347'}
// Inline network object — avoids bundling @btc-vision/bitcoin
const BTC_TESTNET = { messagePrefix:'\x18Bitcoin Signed Message:\n', bech32:'opt', bech32Opnet:'opt', bip32:{public:70617039,private:70615956}, pubKeyHash:111, scriptHash:196, wif:239 }

const DEMO: Proposal[] = [
  { proposalId:'1', proposer:'bc1qalice', target:'0xMotoSwapRouter', btcValue:'0', voteStart:Date.now()/1e3-86400, voteEnd:Date.now()/1e3+172800, yesVotes:'680000', noVotes:'120000', abstainVotes:'50000', state:1, execAfter:0 },
  { proposalId:'2', proposer:'bc1qalice', target:'bc1qdevfund', btcValue:'50000000', voteStart:Date.now()/1e3-604800, voteEnd:Date.now()/1e3-345600, yesVotes:'820000', noVotes:'45000', abstainVotes:'30000', state:2, execAfter:Math.floor(Date.now()/1e3)+86400 },
  { proposalId:'3', proposer:'bc1qbob', target:'0xDAOContract', btcValue:'0', voteStart:Date.now()/1e3-1209600, voteEnd:Date.now()/1e3-950400, yesVotes:'300000', noVotes:'450000', abstainVotes:'100000', state:3, execAfter:0 },
  { proposalId:'4', proposer:'bc1qcarol', target:'0xNativeSwap', btcValue:'0', voteStart:Date.now()/1e3+3600, voteEnd:Date.now()/1e3+262800, yesVotes:'0', noVotes:'0', abstainVotes:'0', state:0, execAfter:0 },
  { proposalId:'5', proposer:'bc1qdave', target:'0xTimelockGuardian', btcValue:'0', voteStart:Date.now()/1e3-2592000, voteEnd:Date.now()/1e3-2332800, yesVotes:'950000', noVotes:'12000', abstainVotes:'5000', state:4, execAfter:0 },
]

const fmt    = (n:string|number) => Number(n).toLocaleString()
const fmtBTC = (s:string|number) => (Number(s)/1e8).toFixed(8)+' BTC'
const pct    = (v:string|number,t:string|number) => Number(t)===0?'0%':((Number(v)/Number(t))*100).toFixed(1)+'%'
const ellipsis = (s:string,n=20) => s.length>n?s.slice(0,8)+'…'+s.slice(-6):s
function timeLeft(end:number) {
  const s=Math.floor(end-Date.now()/1e3); if(s<0) return 'ended'
  const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60)
  return d>0?`${d}d ${h}h`:h>0?`${h}h ${m}m`:`${m}m`
}

function encodeVote(proposalId:string, support:number): Uint8Array {
  const buf=new Uint8Array(4+32+1)
  buf[0]=0x56;buf[1]=0x78;buf[2]=0x13;buf[3]=0x88
  const id=BigInt(proposalId)
  for(let i=0;i<32;i++) buf[4+31-i]=Number((id>>BigInt(i*8))&0xffn)
  buf[36]=support; return buf
}
function encodeExec(proposalId:string): Uint8Array {
  const buf=new Uint8Array(4+32)
  buf[0]=0xfe;buf[1]=0x0d;buf[2]=0x94;buf[3]=0x05
  const id=BigInt(proposalId)
  for(let i=0;i<32;i++) buf[4+31-i]=Number((id>>BigInt(i*8))&0xffn)
  return buf
}

const mono  = {fontFamily:"'Space Mono',monospace"} as const
const inter = {fontFamily:"'Inter',system-ui,sans-serif"} as const
type WalletState = 'disconnected'|'connecting'|'connected'

function WalletBadge({state,address,onConnect}:{state:WalletState;address:string;onConnect:()=>void}) {
  if (state==='connected') return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 14px',background:C.accentBg,border:`1px solid ${C.accentRing}`,borderRadius:20}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:C.accent,display:'inline-block'}}/>
      <span style={{...mono,fontSize:10,color:C.accent}}>{ellipsis(address,22)}</span>
    </div>
  )
  return (
    <button onClick={onConnect} disabled={state==='connecting'}
      style={{padding:'6px 18px',background:C.accentBg,border:`1px solid ${C.accentRing}`,color:C.accent,...mono,fontSize:10,letterSpacing:'0.07em',cursor:'pointer',borderRadius:20,opacity:state==='connecting'?0.5:1}}>
      {state==='connecting'?'◌ CONNECTING':'CONNECT WALLET'}
    </button>
  )
}

function VoteBar({yes,no,abs}:{yes:string;no:string;abs:string}) {
  const t=Number(yes)+Number(no)+Number(abs)||1
  return (
    <div>
      <div style={{display:'flex',height:3,borderRadius:3,overflow:'hidden',background:C.border,margin:'8px 0'}}>
        <div style={{width:`${(Number(yes)/t)*100}%`,background:C.green}}/>
        <div style={{width:`${(Number(no)/t)*100}%`,background:C.red}}/>
        <div style={{width:`${(Number(abs)/t)*100}%`,background:C.borderMid}}/>
      </div>
      <div style={{display:'flex',gap:14,...mono,fontSize:9,color:C.textDim}}>
        <span style={{color:C.green}}>FOR {pct(yes,t)}</span>
        <span style={{color:C.red}}>AGAINST {pct(no,t)}</span>
        <span>ABSTAIN {pct(abs,t)}</span>
      </div>
    </div>
  )
}

function Pill({state}:{state:number}) {
  const c=STATE_COLOR[state]??C.textSub
  return <span style={{...mono,fontSize:9,letterSpacing:'0.09em',padding:'2px 9px',background:c+'18',border:`1px solid ${c}33`,color:c,borderRadius:4}}>{STATE_LABEL[state]??'?'}</span>
}

function ProposalRow({p,active,onClick}:{p:Proposal;active:boolean;onClick:()=>void}) {
  return (
    <div onClick={onClick} style={{padding:'13px 14px',marginBottom:3,cursor:'pointer',background:active?C.bgElevated:C.bgCard,border:`1px solid ${active?C.accent+'55':C.border}`,borderRadius:7,position:'relative',transition:'all .1s'}}>
      {active&&<div style={{position:'absolute',left:0,top:5,bottom:5,width:2,background:C.accent,borderRadius:2}}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <span style={{...mono,fontSize:9,color:C.textSub}}>#{p.proposalId}</span>
        <Pill state={p.state}/>
      </div>
      <div style={{...inter,fontSize:12,fontWeight:500,color:C.text,marginBottom:7,lineHeight:1.4}}>
        {Number(p.btcValue)>0?`⊕ ${fmtBTC(p.btcValue)} → ${ellipsis(p.target,22)}`:`→ ${ellipsis(p.target,28)}`}
      </div>
      <VoteBar yes={p.yesVotes} no={p.noVotes} abs={p.abstainVotes}/>
      {p.state===1&&<div style={{...mono,fontSize:9,color:C.textSub,marginTop:5}}>closes {timeLeft(p.voteEnd)}</div>}
    </div>
  )
}

function VotePanel({p,walletState,address,onVote,onConnect}:{p:Proposal;walletState:WalletState;address:string;onVote:(p:Proposal,support:number)=>Promise<void>;onConnect:()=>void}) {
  const [voting,setVoting]=useState<number|null>(null)
  const go=async(s:number)=>{setVoting(s);try{await onVote(p,s)}finally{setVoting(null)}}
  if (walletState!=='connected') return (
    <div style={{textAlign:'center',padding:'18px 0'}}>
      <div style={{...inter,fontSize:13,color:C.textSub,marginBottom:14}}>Connect your wallet to vote</div>
      <button onClick={onConnect} style={{padding:'9px 22px',background:C.accentBg,border:`1px solid ${C.accentRing}`,color:C.accent,...mono,fontSize:10,letterSpacing:'0.07em',cursor:'pointer',borderRadius:7}}>CONNECT WALLET</button>
    </div>
  )
  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
        {([['FOR',1,C.green,C.greenBg,C.greenRing],['AGAINST',2,C.red,C.redBg,C.redRing],['ABSTAIN',3,C.textSub,C.border+'44',C.borderMid]] as const).map(([l,v,c,bg,ring])=>(
          <button key={l} onClick={()=>go(v)} disabled={voting!==null}
            style={{padding:'12px 0',background:voting===v?bg:C.bgCard,border:`1px solid ${voting===v?ring:C.border}`,color:voting===v?c:C.textSub,...mono,fontSize:10,letterSpacing:'0.08em',cursor:voting!==null?'not-allowed':'pointer',borderRadius:7,opacity:voting!==null&&voting!==v?0.4:1}}>
            {voting===v?'◌':l}
          </button>
        ))}
      </div>
      <div style={{...mono,fontSize:9,color:C.textDim}}>signing as <span style={{color:C.textSub}}>{ellipsis(address,26)}</span></div>
    </>
  )
}

function Detail({p,walletState,address,onVote,onConnect}:{p:Proposal|null;walletState:WalletState;address:string;onVote:(p:Proposal,support:number)=>Promise<void>;onConnect:()=>void}) {
  const [execLoading,setExecLoading]=useState(false)
  if (!p) return (
    <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',color:C.textDim,...mono,fontSize:11}}>
        <div style={{fontSize:28,marginBottom:10}}>◈</div>SELECT A PROPOSAL
      </div>
    </div>
  )
  const total=Number(p.yesVotes)+Number(p.noVotes)+Number(p.abstainVotes)
  const canExec=p.state===2&&Date.now()/1e3>=p.execAfter
  const locked=p.state===2&&!canExec
  const doExec=async()=>{setExecLoading(true);try{await onVote(p,0)}finally{setExecLoading(false)}}
  return (
    <div style={{padding:28,overflowY:'auto',height:'100%'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:22}}>
        <div>
          <div style={{...mono,fontSize:9,color:C.textSub,marginBottom:4}}>PROPOSAL #{p.proposalId}</div>
          <div style={{...inter,fontSize:14,fontWeight:600,color:C.text,lineHeight:1.4}}>
            {Number(p.btcValue)>0?`Transfer ${fmtBTC(p.btcValue)}`:`Call ${ellipsis(p.target,24)}`}
          </div>
        </div>
        <Pill state={p.state}/>
      </div>
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,padding:16,marginBottom:14}}>
        <div style={{...mono,fontSize:9,color:C.textDim,letterSpacing:'0.12em',marginBottom:14}}>VOTE TALLY</div>
        <VoteBar yes={p.yesVotes} no={p.noVotes} abs={p.abstainVotes}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:14}}>
          {([['FOR',p.yesVotes,C.green],['AGAINST',p.noVotes,C.red],['ABSTAIN',p.abstainVotes,C.textSub]] as const).map(([l,v,c])=>(
            <div key={l} style={{textAlign:'center',padding:'10px 0',background:C.bg,borderRadius:6}}>
              <div style={{...inter,fontSize:17,fontWeight:700,color:c}}>{fmt(v)}</div>
              <div style={{...mono,fontSize:8,color:C.textDim,marginTop:2,letterSpacing:'0.1em'}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:12,paddingTop:10,display:'flex',justifyContent:'space-between',...mono,fontSize:9,color:C.textSub}}>
          <span>{fmt(total)} votes cast</span>
          {p.state===1&&<span style={{color:C.accent}}>closes {timeLeft(p.voteEnd)}</span>}
          {p.state===0&&<span>opens {timeLeft(p.voteStart)}</span>}
        </div>
      </div>
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,padding:16,marginBottom:14}}>
        <div style={{...mono,fontSize:9,color:C.textDim,letterSpacing:'0.12em',marginBottom:8}}>TARGET CONTRACT</div>
        <div style={{...mono,fontSize:11,color:C.textSub,wordBreak:'break-all',lineHeight:1.7}}>{p.target}</div>
        {Number(p.btcValue)>0&&<div style={{marginTop:10,padding:'8px 12px',background:C.bg,borderRadius:6,...mono,fontSize:12,color:'#f59e0b'}}>⊕ {fmtBTC(p.btcValue)}</div>}
      </div>
      {p.state===1&&(
        <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,padding:16,marginBottom:14}}>
          <div style={{...mono,fontSize:9,color:C.textDim,letterSpacing:'0.12em',marginBottom:12}}>CAST VOTE</div>
          <VotePanel p={p} walletState={walletState} address={address} onVote={onVote} onConnect={onConnect}/>
        </div>
      )}
      {canExec&&<button onClick={doExec} disabled={execLoading} style={{width:'100%',padding:13,background:C.greenBg,border:`1px solid ${C.greenRing}`,color:C.green,...mono,fontSize:10,letterSpacing:'0.09em',cursor:'pointer',borderRadius:8,opacity:execLoading?0.6:1}}>{execLoading?'◌ SIGNING…':'⚡ EXECUTE PROPOSAL'}</button>}
      {locked&&<div style={{textAlign:'center',padding:13,border:`1px solid ${C.border}`,borderRadius:8,...mono,fontSize:10,color:C.textSub}}>⏳ TIMELOCK — executable in {timeLeft(p.execAfter)}</div>}
    </div>
  )
}

type DeployState='idle'|'deploying'|'done'|'error'
const FIELDS=[
  {label:'DAO NAME',ph:'My Protocol DAO',type:'text',key:'daoName'},
  {label:'TOKEN NAME',ph:'My Protocol Token',type:'text',key:'tokenName'},
  {label:'TOKEN SYMBOL',ph:'MPT',type:'text',key:'tokenSymbol'},
  {label:'MAX SUPPLY',ph:'1000000',type:'number',key:'maxSupply'},
  {label:'VOTING PERIOD (secs)',ph:'259200',type:'number',key:'votingPeriod'},
  {label:'QUORUM BPS (400=4%)',ph:'400',type:'number',key:'quorumBps'},
  {label:'EXEC DELAY (secs)',ph:'86400',type:'number',key:'execDelay'},
]

function DeployTab({factory,walletState,address,onConnect,notify}:{factory:FactoryInfo|null;walletState:WalletState;address:string;onConnect:()=>void;notify:(m:string,ok?:boolean)=>void}) {
  const [ds,setDs]=useState<DeployState>('idle')
  const [result,setResult]=useState('')
  const [error,setError]=useState('')
  const [form,setForm]=useState<Record<string,string>>({daoName:'',tokenName:'',tokenSymbol:'',maxSupply:'1000000',votingPeriod:'259200',quorumBps:'400',execDelay:'86400'})

  const deploy=async()=>{
    const w=window.opnet; if(!isOPWallet(w)){notify('OPWallet not connected',false);return}
    const addr=(address||'').trim()
    if(!addr){notify('Wallet address not loaded',false);return}
    if(!form.daoName||!form.tokenName||!form.tokenSymbol){notify('Fill all name fields',false);return}
    setDs('deploying');setError('')
    try{
      const res=await fetch('/DAOFactory.wasm')
      if(!res.ok) throw new Error('DAOFactory.wasm not found')
      const bytecode=new Uint8Array(await res.arrayBuffer())
      const {JSONRpcProvider}=await import('opnet')
      const provider=new JSONRpcProvider('https://testnet.opnet.org')
      const utxos=await provider.utxoManager.getUTXOs({address:addr,mergePendingUTXOs:false,filterSpentUTXOs:true})
      if(!utxos?.length) throw new Error(`No UTXOs for ${addr} — fund with testnet BTC first`)
      // Use deployContract directly on OPWallet — it provides signer internally
      const r=await w.web3.deployContract({bytecode,utxos,feeRate:10,priorityFee:330n,gasSatFee:1000n} as never)
      if(!r) throw new Error('Deployment returned null')
      const addr0=r.contractAddress
      setResult(addr0);setDs('done');notify(`Deployed: ${addr0}`)
    }catch(e:unknown){
      const msg=(e as Error).message??String(e)
      console.error('[DAO deploy]',e)
      setError(msg);setDs('error');notify(msg,false)
    }
  }

  const inp={width:'100%',padding:'9px 12px',background:C.bg,border:`1px solid ${C.border}`,color:C.text,...mono,fontSize:11,borderRadius:6,boxSizing:'border-box' as const,outline:'none'}
  return(
    <div style={{maxWidth:520,margin:'32px auto',padding:'0 20px 80px'}}>
      <h2 style={{...inter,fontSize:22,fontWeight:700,color:C.text,marginBottom:4}}>Deploy Factory</h2>
      <p style={{...mono,fontSize:10,color:C.textSub,marginBottom:24,lineHeight:1.8}}>
        One-time deployment of DAOFactory.wasm via OPWallet.<br/>
        After deploying, set the address as <code style={{color:C.text}}>FACTORY_ADDRESS</code> in Railway.
      </p>
      <div style={{background:C.bgCard,border:`1px solid ${walletState==='connected'?C.accentRing:C.border}`,borderRadius:8,padding:16,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{...mono,fontSize:9,color:C.textDim,letterSpacing:'0.1em',marginBottom:4}}>WALLET</div>
            <div style={{...mono,fontSize:11,color:walletState==='connected'?C.green:C.textSub}}>
              {walletState==='connected'?`● ${ellipsis(address,26)}`:'○ Not connected'}
            </div>
          </div>
          {walletState!=='connected'&&<button onClick={onConnect} style={{padding:'7px 16px',background:C.accentBg,border:`1px solid ${C.accentRing}`,color:C.accent,...mono,fontSize:9,cursor:'pointer',borderRadius:6}}>CONNECT</button>}
        </div>
        {!window.opnet&&<div style={{marginTop:10,padding:'8px 12px',background:C.bg,borderRadius:6,...mono,fontSize:9,color:C.textSub}}>OPWallet not detected — <a href="https://opnet.org" target="_blank" rel="noreferrer" style={{color:C.accent,textDecoration:'none'}}>install at opnet.org ↗</a></div>}
      </div>
      {FIELDS.map(({label,ph,type,key})=>(
        <div key={key} style={{marginBottom:12}}>
          <div style={{...mono,fontSize:9,color:C.textDim,letterSpacing:'0.1em',marginBottom:5}}>{label}</div>
          <input type={type} placeholder={ph} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={inp}/>
        </div>
      ))}
      <div style={{marginBottom:18}}>
        <div style={{...mono,fontSize:9,color:C.textDim,letterSpacing:'0.1em',marginBottom:5}}>MINT TO CREATOR</div>
        <select value={form.mintToCreator??'true'} onChange={e=>setForm(f=>({...f,mintToCreator:e.target.value}))} style={{...inp,cursor:'pointer'}}>
          <option value="true">Yes — mint to deployer</option>
          <option value="false">No — mint to treasury</option>
        </select>
      </div>
      <button onClick={deploy} disabled={walletState!=='connected'||ds==='deploying'}
        style={{width:'100%',padding:13,background:walletState==='connected'?C.accentBg:C.bgCard,border:`1px solid ${walletState==='connected'?C.accentRing:C.border}`,color:walletState==='connected'?C.accent:C.textDim,...mono,fontSize:10,letterSpacing:'0.09em',cursor:walletState==='connected'?'pointer':'not-allowed',borderRadius:8,opacity:ds==='deploying'?0.6:1}}>
        {ds==='deploying'?'◌ SIGNING & BROADCASTING…':'DEPLOY DAOFACTORY.WASM'}
      </button>
      {ds==='done'&&(
        <div style={{marginTop:16,padding:16,background:C.greenBg,border:`1px solid ${C.greenRing}`,borderRadius:8}}>
          <div style={{...mono,fontSize:9,color:C.green+'88',marginBottom:6,letterSpacing:'0.1em'}}>DEPLOYED ✓</div>
          <div style={{...mono,fontSize:11,color:C.green,wordBreak:'break-all',marginBottom:10}}>{result}</div>
          <div style={{...inter,fontSize:12,color:C.textSub,marginBottom:10}}>Set as <code style={{color:C.text}}>FACTORY_ADDRESS</code> in Railway → Variables.</div>
          <button onClick={()=>{navigator.clipboard.writeText(result);notify('Copied!')}} style={{padding:'6px 14px',background:C.greenBg,border:`1px solid ${C.greenRing}`,color:C.green,...mono,fontSize:9,cursor:'pointer',borderRadius:6}}>COPY ADDRESS</button>
        </div>
      )}
      {ds==='error'&&(
        <div style={{marginTop:16,padding:16,background:C.redBg,border:`1px solid ${C.redRing}`,borderRadius:8}}>
          <div style={{...mono,fontSize:9,color:C.red+'88',marginBottom:6}}>ERROR</div>
          <div style={{...mono,fontSize:11,color:C.red,wordBreak:'break-all'}}>{error}</div>
        </div>
      )}
      <div style={{marginTop:22,padding:14,background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,...mono,fontSize:10,color:C.textSub,lineHeight:2}}>
        <div style={{color:C.textDim,fontSize:9,letterSpacing:'0.1em',marginBottom:6}}>CURRENT FACTORY</div>
        Factory: <span style={{color:C.text}}>{factory?.factoryAddress||'—'}</span><br/>
        Network: <span style={{color:C.text}}>{factory?.network||'testnet'}</span><br/>
        DAOs: <span style={{color:C.text}}>{factory?.totalDAOs??'—'}</span>
      </div>
    </div>
  )
}

type Tab='proposals'|'treasury'|'relayer'|'deploy'
type Filter='all'|'active'|'pending'|'closed'

export default function App() {
  const [tab,setTab]           = useState<Tab>('proposals')
  const [filter,setFilter]     = useState<Filter>('all')
  const [proposals]            = useState<Proposal[]>(DEMO)
  const [selected,setSelected] = useState<Proposal|null>(DEMO[0])
  const [factory,setFactory]   = useState<FactoryInfo|null>(null)
  const [relayer,setRelayer]   = useState<RelayerStatus|null>(null)
  const [toast,setToast]       = useState<{msg:string;ok:boolean}|null>(null)
  const [health,setHealth]     = useState('…')
  const [walletState,setWalletState] = useState<WalletState>('disconnected')
  const [address,setAddress]   = useState('')

  const notify=useCallback((msg:string,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),4000)},[])

  useEffect(()=>{
    const w=window.opnet; if(!w) return
    w.getAccounts().then(accs=>{
      if(accs?.length){setAddress(accs[0]);setWalletState('connected')}
    }).catch(()=>{})
    w.on('accountsChanged',(accs:string[])=>{
      if(!accs.length){setWalletState('disconnected');setAddress('')}
      else{setAddress(accs[0]);setWalletState('connected')}
    })
  },[])

  const connectWallet=useCallback(async()=>{
    const w=window.opnet
    if(!w){notify('OPWallet not found — install at opnet.org',false);return}
    setWalletState('connecting')
    try{
      const accs=await w.requestAccounts()
      if(!accs?.length) throw new Error('No accounts returned')
      setAddress(accs[0]);setWalletState('connected');notify('Wallet connected ✓')
    }catch(e:unknown){setWalletState('disconnected');notify((e as Error).message??'Connection failed',false)}
  },[notify])

  const handleVote=useCallback(async(p:Proposal,support:number)=>{
    const w=window.opnet
    if(!isOPWallet(w)){notify('Connect wallet first',false);return}
    const addr=(address||'').trim()
    if(!addr){notify('Wallet address not loaded — disconnect and reconnect',false);return}
    const contractAddr=(p.target||'').trim()
    if(!contractAddr){notify('Proposal has no target address',false);return}
    notify('Fetching UTXOs…')
    try{
      const {JSONRpcProvider}=await import('opnet')
      const provider=new JSONRpcProvider('https://testnet.opnet.org')
      const utxos=await provider.utxoManager.getUTXOs({address:addr,mergePendingUTXOs:false,filterSpentUTXOs:true})
      if(!utxos?.length) throw new Error(`No UTXOs for ${addr} — fund wallet with testnet BTC first`)
      notify(`Signing (${utxos.length} UTXO${utxos.length===1?'':'s'})…`)
      const calldata=new Uint8Array(support===0?encodeExec(p.proposalId):encodeVote(p.proposalId,support))
      // Call signAndBroadcastInteraction directly — minimal params, no null fields
      const [fund,interact]=await w.web3.signAndBroadcastInteraction({
        to:contractAddr,
        calldata,
        utxos,
        feeRate:10,
        priorityFee:330n,
        gasSatFee:1000n,
        network:BTC_TESTNET as never,
      } as never)
      console.log('[DAO] fund tx:', fund, 'interact tx:', interact)
      const label=support===0?'Execute':['','FOR','AGAINST','ABSTAIN'][support]
      notify(`${label} broadcast ✓`)
    }catch(e:unknown){
      const err=e as Error
      console.error('[DAO] handleVote error:', err.message, err.stack)
      notify(err.message??'Transaction failed',false)
    }
  },[address,notify])

  useEffect(()=>{
    api.health().then((h:{ok:boolean})=>setHealth(h.ok?'online':'degraded')).catch(()=>setHealth('offline'))
    api.factory().then(setFactory).catch(()=>{})
    api.relayer().then(setRelayer).catch(()=>{})
  },[])

  const filtered=proposals.filter(p=>filter==='active'?p.state===1:filter==='pending'?p.state===0:filter==='closed'?p.state>1:true)
  const activeCount=proposals.filter(p=>p.state===1).length

  return(
    <div style={{minHeight:'100vh',background:C.bg,color:C.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Mono&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:${C.bg}} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
        button,a{transition:opacity .12s,border-color .12s,background .12s}
        input:focus,select:focus{outline:none;border-color:${C.borderMid}!important}
      `}</style>
      <header style={{height:54,borderBottom:`1px solid ${C.border}`,background:C.bgCard,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 22px',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:30,height:30,borderRadius:8,background:C.accentBg,border:`1px solid ${C.accentRing}`,display:'grid',placeItems:'center',color:C.accent,fontSize:15}}>◈</div>
          <div>
            <div style={{...inter,fontSize:13,fontWeight:600,color:C.text}}>OPNet DAO Factory</div>
            <div style={{...mono,fontSize:8,color:C.textDim,letterSpacing:'0.13em',marginTop:1}}>{factory?`${factory.network.toUpperCase()} · ${factory.totalDAOs} DAO${factory.totalDAOs!==1?'s':''}`:'BITCOIN L1 · OPNET'}</div>
          </div>
          {activeCount>0&&<span style={{...mono,fontSize:9,background:C.accentBg,border:`1px solid ${C.accentRing}`,color:C.accent,padding:'2px 9px',borderRadius:12}}>{activeCount} ACTIVE</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:18}}>
          <nav style={{display:'flex'}}>
            {(['proposals','treasury','relayer','deploy'] as Tab[]).map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{background:'none',border:'none',borderBottom:tab===t?`2px solid ${C.accent}`:'2px solid transparent',...mono,fontSize:9,letterSpacing:'0.07em',color:tab===t?C.text:C.textSub,padding:'4px 11px',cursor:'pointer',textTransform:'uppercase',marginTop:2}}>{t}</button>
            ))}
          </nav>
          <WalletBadge state={walletState} address={address} onConnect={connectWallet}/>
        </div>
      </header>
      {tab==='proposals'&&(
        <div style={{display:'grid',gridTemplateColumns:'310px 1fr',height:'calc(100vh - 54px - 30px)'}}>
          <aside style={{borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',background:C.bgCard}}>
            <div style={{padding:'9px 10px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:5,alignItems:'center'}}>
              <div style={{display:'flex',gap:3,flex:1}}>
                {(['all','active','pending','closed'] as Filter[]).map(f=>(
                  <button key={f} onClick={()=>setFilter(f)} style={{...mono,fontSize:8,padding:'3px 8px',background:filter===f?C.bgElevated:'none',border:`1px solid ${filter===f?C.borderMid:C.border}`,color:filter===f?C.text:C.textSub,cursor:'pointer',borderRadius:4,textTransform:'uppercase'}}>{f}</button>
                ))}
              </div>
              <button onClick={()=>setTab('deploy')} style={{...mono,fontSize:8,padding:'3px 9px',background:C.accentBg,border:`1px solid ${C.accentRing}`,color:C.accent,cursor:'pointer',borderRadius:4}}>+ NEW</button>
            </div>
            <div style={{overflowY:'auto',flex:1,padding:8}}>
              {filtered.map(p=><ProposalRow key={p.proposalId} p={p} active={selected?.proposalId===p.proposalId} onClick={()=>setSelected(p)}/>)}
            </div>
          </aside>
          <main style={{overflowY:'auto',background:C.bg}}>
            <Detail p={selected} walletState={walletState} address={address} onVote={handleVote} onConnect={connectWallet}/>
          </main>
        </div>
      )}
      {tab==='treasury'&&(
        <div style={{maxWidth:640,margin:'32px auto',padding:'0 20px'}}>
          <h2 style={{...inter,fontSize:22,fontWeight:700,color:C.text,marginBottom:22}}>Treasury</h2>
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,padding:16,marginBottom:14}}>
            <div style={{...mono,fontSize:9,color:C.textDim,letterSpacing:'0.12em',marginBottom:14}}>ASSETS</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[['OPN TOKENS','142,500',C.text],['BTC','0.58250000','#f59e0b'],['PENDING OPS','2',C.accent],['FULFILLED','5',C.blue]].map(([l,v,c])=>(
                <div key={l} style={{padding:14,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6}}>
                  <div style={{...mono,fontSize:8,color:C.textDim,marginBottom:6,letterSpacing:'0.1em'}}>{l}</div>
                  <div style={{...inter,fontSize:20,fontWeight:700,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab==='relayer'&&(
        <div style={{maxWidth:640,margin:'32px auto',padding:'0 20px'}}>
          <h2 style={{...inter,fontSize:22,fontWeight:700,color:C.text,marginBottom:22}}>BTC Relayer</h2>
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,padding:16,marginBottom:14}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
              {(relayer?[
                ['STATUS',relayer.status.toUpperCase(),relayer.status==='running'?C.green:C.red],
                ['NETWORK',relayer.network.toUpperCase(),C.textSub],
                ['PENDING',String(relayer.pending),C.accent],
              ]:[['STATUS','—',C.textDim],['NETWORK','—',C.textDim],['PENDING','—',C.textDim]]).map(([l,v,c])=>(
                <div key={l} style={{padding:12,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6}}>
                  <div style={{...mono,fontSize:8,color:C.textDim,letterSpacing:'0.1em',marginBottom:4}}>{l}</div>
                  <div style={{...inter,fontSize:15,fontWeight:600,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {tab==='deploy'&&<DeployTab factory={factory} walletState={walletState} address={address} onConnect={connectWallet} notify={notify}/>}
      <div style={{position:'fixed',bottom:0,left:0,right:0,height:30,borderTop:`1px solid ${C.border}`,background:C.bgCard,display:'flex',alignItems:'center',gap:22,padding:'0 20px'}}>
        {[
          ['API',health,health==='online'?C.green:health==='offline'?C.red:C.textSub],
          ['FACTORY',factory?ellipsis(factory.factoryAddress):'not set',factory?C.textSub:C.textDim],
          ['NETWORK',factory?.network??'testnet',C.textDim],
          ['DAOS',factory?String(factory.totalDAOs):'—',C.textDim],
          ['PROPOSALS',String(proposals.length),C.textDim],
        ].map(([l,v,c])=>(
          <div key={l} style={{display:'flex',gap:6,alignItems:'baseline'}}>
            <span style={{...mono,fontSize:8,color:C.textDim,letterSpacing:'0.1em'}}>{l}</span>
            <span style={{...mono,fontSize:9,color:c}}>{v}</span>
          </div>
        ))}
      </div>
      {toast&&(
        <div style={{position:'fixed',bottom:42,right:20,background:toast.ok?C.greenBg:C.redBg,border:`1px solid ${toast.ok?C.greenRing:C.redRing}`,color:toast.ok?C.green:C.red,padding:'10px 16px',...inter,fontSize:12,fontWeight:500,borderRadius:8,zIndex:9999,maxWidth:380,boxShadow:'0 4px 24px #00000066'}}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
