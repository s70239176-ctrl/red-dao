import { useState, useEffect, useCallback } from 'react'
import { api, type FactoryInfo, type Proposal, type RelayerStatus } from './api'

// ── Constants ─────────────────────────────────────────────────────────────────
const STATE_LABEL = ['PENDING', 'ACTIVE', 'SUCCEEDED', 'DEFEATED', 'EXECUTED', 'CANCELLED']
const STATE_COLOR = ['#888', '#00ff88', '#ffcc00', '#ff4455', '#4488ff', '#666']

// ── Demo data (shown until a real factory address is set) ─────────────────────
const DEMO: Proposal[] = [
  { proposalId:'1', proposer:'bc1qalice', target:'0xMotoSwapRouter', btcValue:'0', voteStart:Date.now()/1e3-86400, voteEnd:Date.now()/1e3+172800, yesVotes:'680000', noVotes:'120000', abstainVotes:'50000', state:1, execAfter:0 },
  { proposalId:'2', proposer:'bc1qalice', target:'bc1qdevfund', btcValue:'50000000', voteStart:Date.now()/1e3-604800, voteEnd:Date.now()/1e3-345600, yesVotes:'820000', noVotes:'45000', abstainVotes:'30000', state:2, execAfter:Math.floor(Date.now()/1e3)+86400 },
  { proposalId:'3', proposer:'bc1qbob', target:'0xDAOContract', btcValue:'0', voteStart:Date.now()/1e3-1209600, voteEnd:Date.now()/1e3-950400, yesVotes:'300000', noVotes:'450000', abstainVotes:'100000', state:3, execAfter:0 },
  { proposalId:'4', proposer:'bc1qcarol', target:'0xNativeSwap', btcValue:'0', voteStart:Date.now()/1e3+3600, voteEnd:Date.now()/1e3+262800, yesVotes:'0', noVotes:'0', abstainVotes:'0', state:0, execAfter:0 },
  { proposalId:'5', proposer:'bc1qdave', target:'0xTimelockGuardian', btcValue:'0', voteStart:Date.now()/1e3-2592000, voteEnd:Date.now()/1e3-2332800, yesVotes:'950000', noVotes:'12000', abstainVotes:'5000', state:4, execAfter:0 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: string|number) => Number(n).toLocaleString()
const fmtBTC = (s: string|number) => (Number(s)/1e8).toFixed(8)+' BTC'
const pct = (v: string|number, t: string|number) => Number(t) === 0 ? '0%' : ((Number(v)/Number(t))*100).toFixed(1)+'%'
function timeLeft(end: number) {
  const s = Math.floor(end - Date.now()/1e3)
  if (s < 0) return 'ended'
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60)
  if (d>0) return `${d}d ${h}h`; if (h>0) return `${h}h ${m}m`; return `${m}m`
}
const short = (s: string, n=18) => s.length>n ? s.slice(0,6)+'…'+s.slice(-4) : s

// ── Styles ────────────────────────────────────────────────────────────────────
const mono = { fontFamily: "'Space Mono', monospace" } as const
const serif = { fontFamily: "'Playfair Display', serif" } as const
const card = { background:'#070707', border:'1px solid #1a1a1a', borderRadius:4, padding:16 } as const

// ── OPWallet types (window.opnet injected by extension) ───────────────────────
declare global {
  interface Window {
    opnet?: {
      requestAccounts(): Promise<string[]>
      getAccounts(): Promise<string[]>
      getNetwork(): Promise<string>
      getPublicKey(): Promise<string>
      on(event: string, cb: (...args: unknown[]) => void): void
      web3: {
        deployContract(params: {
          bytecode: Uint8Array
          utxos: unknown[]
          feeRate: number
          priorityFee: bigint
          gasSatFee: bigint
        }): Promise<{ contractAddress: string; contractPubKey: string; transaction: [string, string] }>
      }
    }
  }
}

// ── DeployTab component ────────────────────────────────────────────────────────
type DeployField = { label: string; placeholder: string; type: string; key: string }
const DEPLOY_FIELDS: DeployField[] = [
  { label: 'DAO NAME', placeholder: 'My Protocol DAO', type: 'text', key: 'daoName' },
  { label: 'TOKEN NAME', placeholder: 'My Protocol Token', type: 'text', key: 'tokenName' },
  { label: 'TOKEN SYMBOL (max 10 chars)', placeholder: 'MPT', type: 'text', key: 'tokenSymbol' },
  { label: 'MAX SUPPLY', placeholder: '1000000', type: 'number', key: 'maxSupply' },
  { label: 'VOTING PERIOD (seconds)', placeholder: '259200', type: 'number', key: 'votingPeriod' },
  { label: 'QUORUM BPS (400 = 4%)', placeholder: '400', type: 'number', key: 'quorumBps' },
  { label: 'EXECUTION DELAY (seconds)', placeholder: '86400', type: 'number', key: 'execDelay' },
]

type WalletState = 'disconnected' | 'connecting' | 'connected'
type DeployState = 'idle' | 'deploying' | 'done' | 'error'

function DeployTab({ factory, notify }: { factory: FactoryInfo | null; notify: (m: string, ok?: boolean) => void }) {
  const [walletState, setWalletState] = useState<WalletState>('disconnected')
  const [address, setAddress] = useState<string>('')
  const [network, setNetwork] = useState<string>('')
  const [deployState, setDeployState] = useState<DeployState>('idle')
  const [deployResult, setDeployResult] = useState<{ contractAddress: string } | null>(null)
  const [deployError, setDeployError] = useState<string>('')
  const [form, setForm] = useState<Record<string, string>>({
    daoName: '', tokenName: '', tokenSymbol: '', maxSupply: '1000000',
    votingPeriod: '259200', quorumBps: '400', execDelay: '86400',
  })

  // Auto-detect if already connected
  useEffect(() => {
    if (typeof window !== 'undefined' && window.opnet) {
      window.opnet.getAccounts().then(accs => {
        if (accs && accs.length > 0) {
          setAddress(accs[0])
          setWalletState('connected')
          window.opnet!.getNetwork().then(setNetwork).catch(() => {})
        }
      }).catch(() => {})
      window.opnet.on('accountsChanged', (accs: unknown) => {
        const accounts = accs as string[]
        if (accounts.length === 0) { setWalletState('disconnected'); setAddress('') }
        else { setAddress(accounts[0]); setWalletState('connected') }
      })
    }
  }, [])

  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.opnet) {
      notify('OPWallet extension not found. Install it from opnet.org', false)
      return
    }
    setWalletState('connecting')
    try {
      const accs = await window.opnet.requestAccounts()
      if (!accs || accs.length === 0) throw new Error('No accounts returned')
      setAddress(accs[0])
      const net = await window.opnet.getNetwork().catch(() => 'unknown')
      setNetwork(net)
      setWalletState('connected')
      notify('OPWallet connected')
    } catch (e: unknown) {
      setWalletState('disconnected')
      notify((e as Error).message ?? 'Connection failed', false)
    }
  }

  const deployFactory = async () => {
    if (!window.opnet?.web3) { notify('OPWallet not connected', false); return }
    const { daoName, tokenName, tokenSymbol, maxSupply, votingPeriod, quorumBps, execDelay } = form
    if (!daoName || !tokenName || !tokenSymbol) { notify('Fill in all name fields', false); return }

    setDeployState('deploying')
    setDeployError('')
    try {
      // Load the wasm bytecode from public folder
      const res = await fetch('/DAOFactory.wasm')
      if (!res.ok) throw new Error('DAOFactory.wasm not found in /public — upload it first')
      const buf = await res.arrayBuffer()
      const bytecode = new Uint8Array(buf)

      // Fetch UTXOs via OPNet provider
      const { JSONRpcProvider } = await import('opnet')
      const provider = new JSONRpcProvider('https://testnet.opnet.org')
      const utxos = await provider.utxoManager.getUTXOs({
        address,
        mergePendingUTXOs: false,
        filterSpentUTXOs: true,
      })
      if (!utxos || utxos.length === 0) throw new Error(`No UTXOs for ${address} — fund with testnet BTC first`)

      const result = await window.opnet.web3.deployContract({
        bytecode,
        utxos,
        feeRate: 10,
        priorityFee: 330n,
        gasSatFee: 1000n,
      })

      setDeployResult({ contractAddress: result.contractAddress })
      setDeployState('done')
      notify(`Deployed! Contract: ${result.contractAddress}`)
    } catch (e: unknown) {
      const msg = (e as Error).message ?? String(e)
      setDeployError(msg)
      setDeployState('error')
      notify(msg, false)
    }
  }

  const inp = (key: string) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value })),
    style: { width:'100%', padding:'8px 11px', background:'#050505', border:'1px solid #1a1a1a', color:'#d0d0d0', fontFamily:"'Space Mono',monospace", fontSize:11, borderRadius:3, boxSizing:'border-box' as const, outline:'none' },
  })

  return (
    <div style={{ maxWidth:520, margin:'36px auto', padding:'0 20px 80px' }}>
      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:'#f0f0f0', marginBottom:6 }}>Deploy DAOFactory</div>
      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'#444', marginBottom:24, lineHeight:1.9 }}>
        Deploys the DAOFactory.wasm contract via your OPWallet extension. This is a one-time operation — after deployment, set the returned address as <span style={{ color:'#666' }}>FACTORY_ADDRESS</span> in Railway.
      </div>

      {/* Wallet connect block */}
      <div style={{ background:'#060606', border:`1px solid ${walletState==='connected'?'#00ff8833':'#1a1a1a'}`, borderRadius:4, padding:14, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:'0.12em', color:'#333', marginBottom:4 }}>OPWALLET</div>
            {walletState === 'connected' ? (
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'#00ff88' }}>
                ● {address.slice(0,10)}…{address.slice(-6)}
                {network && <span style={{ color:'#333', marginLeft:10 }}>{network}</span>}
              </div>
            ) : (
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'#333' }}>
                {walletState === 'connecting' ? '◌ connecting…' : '○ not connected'}
              </div>
            )}
          </div>
          {walletState !== 'connected' && (
            <button
              onClick={connectWallet}
              disabled={walletState === 'connecting'}
              style={{ padding:'7px 14px', background:'#f7931a12', border:'1px solid #f7931a44', color:'#f7931a', fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:'0.1em', cursor:'pointer', borderRadius:3, opacity: walletState==='connecting'?0.5:1 }}>
              {walletState === 'connecting' ? 'CONNECTING…' : 'CONNECT'}
            </button>
          )}
        </div>
        {typeof window !== 'undefined' && !window.opnet && (
          <div style={{ marginTop:10, fontFamily:"'Space Mono',monospace", fontSize:9, color:'#444', borderTop:'1px solid #111', paddingTop:10 }}>
            OPWallet extension not detected. &nbsp;
            <a href="https://opnet.org" target="_blank" rel="noreferrer" style={{ color:'#f7931a', textDecoration:'none' }}>Install at opnet.org ↗</a>
          </div>
        )}
      </div>

      {/* Form */}
      {DEPLOY_FIELDS.map(({ label, placeholder, type, key }) => (
        <div key={key} style={{ marginBottom:12 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:'0.12em', color:'#333', marginBottom:5 }}>{label}</div>
          <input type={type} placeholder={placeholder} {...inp(key)} />
        </div>
      ))}

      <div style={{ marginBottom:12 }}>
        <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:'0.12em', color:'#333', marginBottom:5 }}>MINT INITIAL SUPPLY TO CREATOR</div>
        <select
          value={form.mintToCreator ?? 'true'}
          onChange={e => setForm(f => ({ ...f, mintToCreator: e.target.value }))}
          style={{ width:'100%', padding:'8px 11px', background:'#050505', border:'1px solid #1a1a1a', color:'#d0d0d0', fontFamily:"'Space Mono',monospace", fontSize:11, borderRadius:3 }}>
          <option value="true">Yes — mint to deployer</option>
          <option value="false">No — mint to DAO treasury</option>
        </select>
      </div>

      {/* Deploy button */}
      <button
        onClick={deployFactory}
        disabled={walletState !== 'connected' || deployState === 'deploying'}
        style={{
          width:'100%', marginTop:8, padding:13,
          background: walletState==='connected' ? '#00ff8812' : '#0a0a0a',
          border: `1px solid ${walletState==='connected' ? '#00ff8844' : '#1a1a1a'}`,
          color: walletState==='connected' ? '#00ff88' : '#2a2a2a',
          fontFamily:"'Space Mono',monospace", fontSize:10, letterSpacing:'0.1em',
          cursor: walletState==='connected' && deployState!=='deploying' ? 'pointer' : 'not-allowed',
          borderRadius:3, opacity: deployState==='deploying'?0.6:1,
          transition:'all 0.15s',
        }}>
        {deployState === 'deploying' ? '◌ SIGNING & BROADCASTING…' : 'DEPLOY DAOFACTORY.WASM'}
      </button>

      {walletState !== 'connected' && (
        <div style={{ marginTop:8, fontFamily:"'Space Mono',monospace", fontSize:9, color:'#2a2a2a', textAlign:'center' }}>
          Connect OPWallet to enable deployment
        </div>
      )}

      {/* Result */}
      {deployState === 'done' && deployResult && (
        <div style={{ marginTop:16, padding:14, background:'#00ff8808', border:'1px solid #00ff8833', borderRadius:4 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:'0.12em', color:'#00ff8866', marginBottom:8 }}>DEPLOYED ✓</div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'#00ff88', wordBreak:'break-all', marginBottom:10 }}>
            {deployResult.contractAddress}
          </div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:'#444', lineHeight:1.9 }}>
            Copy this address and set it as <span style={{ color:'#666' }}>FACTORY_ADDRESS</span> in Railway → Variables, then redeploy.
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(deployResult.contractAddress); notify('Copied!') }}
            style={{ marginTop:10, padding:'6px 12px', background:'#00ff8812', border:'1px solid #00ff8833', color:'#00ff88', fontFamily:"'Space Mono',monospace", fontSize:9, cursor:'pointer', borderRadius:3 }}>
            COPY ADDRESS
          </button>
        </div>
      )}

      {deployState === 'error' && (
        <div style={{ marginTop:16, padding:14, background:'#ff445508', border:'1px solid #ff445533', borderRadius:4 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:'0.12em', color:'#ff4455aa', marginBottom:6 }}>ERROR</div>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:'#ff4455', wordBreak:'break-all' }}>{deployError}</div>
        </div>
      )}

      {/* Info footer */}
      <div style={{ marginTop:20, padding:12, background:'#060606', border:'1px solid #0d0d0d', borderRadius:3, fontFamily:"'Space Mono',monospace", fontSize:10, color:'#333', lineHeight:1.9 }}>
        <div style={{ color:'#1a1a1a', marginBottom:6, fontSize:9, letterSpacing:'0.12em' }}>CURRENT FACTORY</div>
        Factory: <span style={{ color:'#444' }}>{factory?.factoryAddress || '—'}</span><br/>
        Network: <span style={{ color:'#444' }}>{factory?.network || 'testnet'}</span><br/>
        DAOs deployed: <span style={{ color:'#444' }}>{factory?.totalDAOs ?? '—'}</span>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VoteBar({ yes, no, abs }: { yes:string; no:string; abs:string }) {
  const t = Number(yes)+Number(no)+Number(abs) || 1
  return (
    <div>
      <div style={{ display:'flex', height:4, borderRadius:2, overflow:'hidden', background:'#111', margin:'8px 0' }}>
        <div style={{ width:`${(Number(yes)/t)*100}%`, background:'#00ff88' }}/>
        <div style={{ width:`${(Number(no)/t)*100}%`, background:'#ff4455' }}/>
        <div style={{ width:`${(Number(abs)/t)*100}%`, background:'#444' }}/>
      </div>
      <div style={{ display:'flex', gap:12, ...mono, fontSize:10, color:'#555' }}>
        <span style={{ color:'#00ff88' }}>YES {pct(yes,t)}</span>
        <span style={{ color:'#ff4455' }}>NO {pct(no,t)}</span>
        <span>ABS {pct(abs,t)}</span>
      </div>
    </div>
  )
}

function Tag({ state }: { state:number }) {
  const c = STATE_COLOR[state] ?? '#888'
  return <span style={{ ...mono, fontSize:9, letterSpacing:'0.12em', padding:'2px 7px', border:`1px solid ${c}`, color:c, borderRadius:2 }}>{STATE_LABEL[state]}</span>
}

function ProposalRow({ p, active, onClick }: { p:Proposal; active:boolean; onClick:()=>void }) {
  return (
    <div onClick={onClick} style={{ ...card, padding:'14px 16px', marginBottom:6, cursor:'pointer', border:`1px solid ${active?'#00ff88':'#111'}`, position:'relative' }}>
      {active && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:'#00ff88', borderRadius:'4px 0 0 4px' }}/>}
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <span style={{ ...mono, fontSize:10, color:'#444' }}>#{p.proposalId}</span>
        <Tag state={p.state}/>
      </div>
      <div style={{ ...serif, fontSize:13, color:'#ccc', marginBottom:4, lineHeight:1.35 }}>
        {Number(p.btcValue)>0 ? `⊕ ${fmtBTC(p.btcValue)} → ${short(p.target)}` : `→ ${short(p.target)}`}
      </div>
      <VoteBar yes={p.yesVotes} no={p.noVotes} abs={p.abstainVotes}/>
      {p.state===1 && <div style={{ ...mono, fontSize:9, color:'#555', marginTop:4 }}>closes in {timeLeft(p.voteEnd)}</div>}
    </div>
  )
}

function Detail({ p, onVote }: { p:Proposal|null; onVote:(id:string,s:number)=>void }) {
  const [hov, setHov] = useState<number|null>(null)
  if (!p) return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#222', ...mono, fontSize:12 }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:36, marginBottom:12 }}>◈</div>SELECT A PROPOSAL</div>
    </div>
  )
  const total = Number(p.yesVotes)+Number(p.noVotes)+Number(p.abstainVotes)
  const canExec = p.state===2 && Date.now()/1e3 >= p.execAfter
  const timelocked = p.state===2 && !canExec

  return (
    <div style={{ padding:32, overflowY:'auto', height:'100%' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
        <span style={{ ...mono, fontSize:10, color:'#444' }}>PROPOSAL #{p.proposalId}</span>
        <Tag state={p.state}/>
      </div>

      {/* Tally */}
      <div style={{ ...card, marginBottom:20 }}>
        <div style={{ ...mono, fontSize:9, letterSpacing:'0.15em', color:'#333', marginBottom:14 }}>VOTE TALLY</div>
        <VoteBar yes={p.yesVotes} no={p.noVotes} abs={p.abstainVotes}/>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:16 }}>
          {([['YES',p.yesVotes,'#00ff88'],['NO',p.noVotes,'#ff4455'],['ABSTAIN',p.abstainVotes,'#666']] as const).map(([l,v,c])=>(
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{ ...serif, fontSize:20, color:c, fontWeight:700 }}>{fmt(v)}</div>
              <div style={{ ...mono, fontSize:9, color:'#444', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ borderTop:'1px solid #111', marginTop:14, paddingTop:10, display:'flex', justifyContent:'space-between', ...mono, fontSize:10, color:'#555' }}>
          <span>{fmt(total)} votes cast</span>
          {p.state===1 && <span>closes {timeLeft(p.voteEnd)}</span>}
          {p.state===0 && <span>opens {timeLeft(p.voteStart)}</span>}
        </div>
      </div>

      {/* Target */}
      <div style={{ ...card, marginBottom:20 }}>
        <div style={{ ...mono, fontSize:9, letterSpacing:'0.15em', color:'#333', marginBottom:6 }}>TARGET</div>
        <div style={{ ...mono, fontSize:11, color:'#888', wordBreak:'break-all' }}>{p.target}</div>
        {Number(p.btcValue)>0 && <div style={{ ...mono, fontSize:11, color:'#f7931a', marginTop:8 }}>⊕ {fmtBTC(p.btcValue)}</div>}
      </div>

      {/* Vote buttons — shown for active proposals */}
      {p.state===1 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ ...mono, fontSize:9, letterSpacing:'0.15em', color:'#333', marginBottom:10 }}>CAST VOTE</div>
          <div style={{ display:'flex', gap:8 }}>
            {([['YES',1,'#00ff88'],['NO',2,'#ff4455'],['ABSTAIN',3,'#666']] as const).map(([l,v,c])=>(
              <button key={l}
                onMouseEnter={()=>setHov(v)} onMouseLeave={()=>setHov(null)}
                onClick={()=>onVote(p.proposalId,v)}
                style={{ flex:1, padding:'10px 0', background:hov===v?c+'22':'transparent', border:`1px solid ${hov===v?c:'#222'}`, color:hov===v?c:'#555', ...mono, fontSize:10, letterSpacing:'0.1em', cursor:'pointer', borderRadius:3 }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ ...mono, fontSize:9, color:'#444', marginTop:6 }}>
            Connect OPWallet / Unisat to sign the vote transaction
          </div>
        </div>
      )}

      {/* Execute */}
      {canExec && (
        <button onClick={()=>onVote(p.proposalId,0)} style={{ width:'100%', padding:11, background:'#00ff8811', border:'1px solid #00ff88', color:'#00ff88', ...mono, fontSize:10, letterSpacing:'0.1em', cursor:'pointer', borderRadius:3 }}>
          EXECUTE PROPOSAL
        </button>
      )}
      {timelocked && (
        <div style={{ textAlign:'center', padding:11, border:'1px solid #1a1a1a', borderRadius:3, ...mono, fontSize:10, color:'#444' }}>
          TIMELOCK — executable in {timeLeft(p.execAfter)}
        </div>
      )}
    </div>
  )
}

type Tab = 'proposals'|'treasury'|'relayer'|'deploy'
type Filter = 'all'|'active'|'pending'|'closed'

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>('proposals')
  const [filter, setFilter] = useState<Filter>('all')
  const [proposals] = useState<Proposal[]>(DEMO)
  const [selected, setSelected] = useState<Proposal|null>(DEMO[0])
  const [factory, setFactory] = useState<FactoryInfo|null>(null)
  const [relayer, setRelayer] = useState<RelayerStatus|null>(null)
  const [toast, setToast] = useState<{msg:string;ok:boolean}|null>(null)
  const [health, setHealth] = useState<string>('…')

  const notify = useCallback((msg:string, ok=true) => {
    setToast({msg,ok}); setTimeout(()=>setToast(null),3200)
  }, [])

  useEffect(() => {
    api.health().then(h => { setHealth(h.ok ? 'online' : 'degraded') }).catch(()=>setHealth('offline'))
    api.factory().then(setFactory).catch(()=>{})
    api.relayer().then(setRelayer).catch(()=>{})
  }, [])

  const filtered = proposals.filter(p => {
    if (filter==='active') return p.state===1
    if (filter==='pending') return p.state===0
    if (filter==='closed') return p.state>1
    return true
  })

  const activeCount = proposals.filter(p=>p.state===1).length

  return (
    <div style={{ minHeight:'100vh', background:'#020202', color:'#e0e0e0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono&family=Playfair+Display:wght@700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#1a1a1a}
        button{transition:all .15s}
        input,textarea{transition:border-color .15s}
        input:focus,textarea:focus{outline:none;border-color:#333!important}
      `}</style>

      {/* ── Header ── */}
      <header style={{ borderBottom:'1px solid #0d0d0d', height:50, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ color:'#00ff88', fontSize:18 }}>◈</span>
          <div>
            <div style={{ ...serif, fontSize:14, color:'#f0f0f0' }}>OPNet DAO Factory</div>
            <div style={{ ...mono, fontSize:9, color:'#2a2a2a', letterSpacing:'0.12em' }}>
              {factory ? `${factory.network.toUpperCase()} · ${factory.totalDAOs} DAO${factory.totalDAOs!==1?'s':''}` : 'BITCOIN L1 · OPNET'}
            </div>
          </div>
          {activeCount>0 && <span style={{ ...mono, fontSize:9, background:'#00ff8818', border:'1px solid #00ff8830', color:'#00ff88', padding:'2px 8px', borderRadius:10 }}>{activeCount} ACTIVE</span>}
        </div>

        <nav style={{ display:'flex' }}>
          {(['proposals','treasury','relayer','deploy'] as Tab[]).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ background:'none', border:'none', ...mono, fontSize:9, letterSpacing:'0.1em', color:tab===t?'#ddd':'#3a3a3a', padding:'6px 12px', cursor:'pointer', textTransform:'uppercase', borderBottom:tab===t?'1px solid #ddd':'1px solid transparent' }}>{t}</button>
          ))}
        </nav>
      </header>

      {/* ── Proposals tab ── */}
      {tab==='proposals' && (
        <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', height:'calc(100vh - 50px - 32px)' }}>
          {/* Sidebar */}
          <div style={{ borderRight:'1px solid #0d0d0d', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'10px 12px', borderBottom:'1px solid #0d0d0d', display:'flex', gap:6, alignItems:'center' }}>
              <div style={{ display:'flex', gap:4, flex:1 }}>
                {(['all','active','pending','closed'] as Filter[]).map(f=>(
                  <button key={f} onClick={()=>setFilter(f)} style={{ ...mono, fontSize:9, padding:'3px 8px', background:'none', border:`1px solid ${filter===f?'#2a2a2a':'#111'}`, color:filter===f?'#ccc':'#3a3a3a', cursor:'pointer', borderRadius:2, textTransform:'uppercase', letterSpacing:'0.08em' }}>{f}</button>
                ))}
              </div>
              <button onClick={()=>setTab('deploy')} style={{ ...mono, fontSize:9, padding:'3px 9px', background:'#00ff8812', border:'1px solid #00ff8830', color:'#00ff88', cursor:'pointer', borderRadius:2 }}>+ NEW</button>
            </div>
            <div style={{ overflowY:'auto', flex:1, padding:10 }}>
              {filtered.map(p=><ProposalRow key={p.proposalId} p={p} active={selected?.proposalId===p.proposalId} onClick={()=>setSelected(p)}/>)}
            </div>
          </div>

          {/* Detail panel */}
          <div style={{ overflowY:'auto' }}>
            <Detail p={selected} onVote={(id,s)=>notify(`Proposal #${id}: open OPWallet to sign ${['','YES','NO','ABSTAIN','execute'][s]} transaction`)}/>
          </div>
        </div>
      )}

      {/* ── Treasury tab ── */}
      {tab==='treasury' && (
        <div style={{ maxWidth:620, margin:'36px auto', padding:'0 20px' }}>
          <div style={{ ...serif, fontSize:22, color:'#f0f0f0', marginBottom:20 }}>Treasury</div>
          <div style={{ ...card, marginBottom:12 }}>
            <div style={{ ...mono, fontSize:9, letterSpacing:'0.15em', color:'#333', marginBottom:14 }}>ASSETS</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[['OPN TOKENS','142,500','#e0e0e0'],['BTC','0.58250000','#f7931a'],['PENDING OPS','2','#ffcc00'],['FULFILLED','5','#4488ff']].map(([l,v,c])=>(
                <div key={l} style={{ background:'#060606', border:'1px solid #111', borderRadius:3, padding:12 }}>
                  <div style={{ ...mono, fontSize:9, color:'#333', marginBottom:4 }}>{l}</div>
                  <div style={{ ...serif, fontSize:20, color:c }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...card }}>
            <div style={{ ...mono, fontSize:9, letterSpacing:'0.15em', color:'#333', marginBottom:12 }}>PENDING TIMELOCK OPS</div>
            {[['Dev Fund — 0.5 BTC','18h 24m'],['MotoSwap LP — 50K OPN','5d 2h']].map(([l,e])=>(
              <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'9px 11px', background:'#060606', border:'1px solid #111', borderRadius:3, marginBottom:6 }}>
                <span style={{ ...mono, fontSize:10, color:'#888' }}>{l}</span>
                <span style={{ ...mono, fontSize:10, color:'#ffcc00' }}>{e}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Relayer tab ── */}
      {tab==='relayer' && (
        <div style={{ maxWidth:620, margin:'36px auto', padding:'0 20px' }}>
          <div style={{ ...serif, fontSize:22, color:'#f0f0f0', marginBottom:20 }}>BTC Transfer Relayer</div>
          <div style={{ ...card, marginBottom:12 }}>
            {(() => { const rows = relayer ? [
                ["STATUS", relayer.status.toUpperCase(), relayer.status==="running"?"#00ff88":"#ff4455"],
                ["NETWORK", relayer.network.toUpperCase(), "#888"],
                ["PENDING", String(relayer.pending), "#ffcc00"],
                ["FULFILLED", String(relayer.fulfilled), "#4488ff"],
                ["SAFETY CAP", fmtBTC(relayer.safetyCapSats), "#f7931a"],
                ["MIN CONFS", String(relayer.minConfirmations), "#888"],
              ] : [["STATUS","LOADING","#333"],["NETWORK","—","#333"],["PENDING","—","#333"]]; return (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {rows.map(([l,v,c])=>(
                <div key={l} style={{ background:"#060606", border:"1px solid #111", borderRadius:3, padding:12 }}>
                  <div style={{ ...mono, fontSize:9, color:"#333", marginBottom:3 }}>{l}</div>
                  <div style={{ ...serif, fontSize:16, color:c }}>{v}</div>
                </div>
              ))}
            </div>
          )})()}
          </div>
          <div style={{ ...card, ...mono, fontSize:10, color:'#444', lineHeight:2 }}>
            <div style={{ color:'#2a2a2a', marginBottom:8, fontSize:9, letterSpacing:'0.12em' }}>HOW IT WORKS</div>
            Listens for <span style={{ color:'#888' }}>TreasuryBTCTransfer</span> events from executed proposals.<br/>
            Waits for {relayer?.minConfirmations ?? 3} confirmations then broadcasts the Bitcoin tx.<br/>
            Safety cap: <span style={{ color:'#f7931a' }}>{relayer ? fmtBTC(relayer.safetyCapSats) : '0.1 BTC'}</span> per transfer.<br/>
            Set <span style={{ color:'#888' }}>RELAYER_KEY</span> env var to enable live signing.
          </div>
        </div>
      )}

      {/* ── Deploy tab ── */}
      {tab==='deploy' && (
        <DeployTab factory={factory} notify={notify} />
      )}

      {/* ── Footer ── */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, height:32, borderTop:'1px solid #0a0a0a', background:'#020202', display:'flex', alignItems:'center', gap:24, padding:'0 20px' }}>
        {[
          ['API', health, health==='online'?'#00ff88':health==='offline'?'#ff4455':'#888'],
          ['FACTORY', factory ? short(factory.factoryAddress) : 'not set', factory?'#888':'#2a2a2a'],
          ['NETWORK', factory?.network ?? 'testnet', '#444'],
          ['DAOS', factory ? String(factory.totalDAOs) : '—', '#444'],
          ['PROPOSALS', String(proposals.length), '#444'],
        ].map(([l,v,c])=>(
          <div key={l} style={{ display:'flex', gap:7, alignItems:'baseline' }}>
            <span style={{ ...mono, fontSize:9, color:'#1a1a1a', letterSpacing:'0.1em' }}>{l}</span>
            <span style={{ ...mono, fontSize:9, color:c }}>{v}</span>
          </div>
        ))}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:'fixed', bottom:40, right:20, background:toast.ok?'#00ff8812':'#ff445514', border:`1px solid ${toast.ok?'#00ff88':'#ff4455'}`, color:toast.ok?'#00ff88':'#ff4455', padding:'9px 14px', ...mono, fontSize:10, borderRadius:3, zIndex:9999, maxWidth:360 }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
