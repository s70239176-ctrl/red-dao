import { Router, Request, Response } from 'express'
export const proposalRouter = Router()
const RPC = process.env.OPNET_RPC || 'https://regtest.opnet.org'
const NETWORK = process.env.OPNET_NETWORK || 'regtest'
async function call(to: string, calldata: string) {
  const r = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ jsonrpc:'2.0', id:1, method:'opnet_call', params:{ to, calldata, network:NETWORK } }) })
  const json = (await r.json()) as { result?: unknown; error?: { message: string } }
  if (json.error) throw new Error(json.error.message)
  return json.result
}
proposalRouter.get('/:daoAddress', async (req: Request, res: Response) => {
  const daoAddress = String(req.params['daoAddress'] ?? '')
  if (!daoAddress || daoAddress.length < 8) { res.status(400).json({ error:'Invalid address' }); return }
  const page = Math.max(1, parseInt(String(req.query['page']||'1'), 10))
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query['limit']||'20'), 10)))
  try {
    const countResult = (await call(daoAddress,'0xda35c664').catch(()=>null)) as {count?:string}|null
    const total = countResult?.count ? parseInt(countResult.count, 16) : 0
    const start = Math.max(1, total-(page-1)*limit), end = Math.max(0, start-limit)
    const proposals: unknown[] = []
    for (let id = start; id > end; id--) {
      const p = await call(daoAddress, '0xc7f758a8'+id.toString(16).padStart(64,'0')).catch(()=>null)
      if (p) proposals.push({ proposalId:String(id), ...(p as object) })
    }
    res.json({ proposals, total, page, limit, pages:Math.ceil(total/limit) })
  } catch(e: unknown) { res.status(500).json({ error:(e as Error).message }) }
})
proposalRouter.get('/:daoAddress/:id', async (req: Request, res: Response) => {
  const daoAddress = String(req.params['daoAddress'] ?? '')
  const pid = parseInt(String(req.params['id'] ?? ''), 10)
  if (!pid || pid < 1) { res.status(400).json({ error:'Invalid proposal id' }); return }
  try {
    const result = await call(daoAddress, '0xc7f758a8'+pid.toString(16).padStart(64,'0'))
    if (!result) { res.status(404).json({ error:'Not found' }); return }
    res.json({ proposalId:String(pid), ...(result as object) })
  } catch(e: unknown) { res.status(500).json({ error:(e as Error).message }) }
})
