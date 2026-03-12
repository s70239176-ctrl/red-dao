import { Router, Request, Response } from 'express'
export const daoRouter = Router()
const RPC = process.env.OPNET_RPC || 'https://regtest.opnet.org'
const FACTORY = process.env.FACTORY_ADDRESS || ''
const NETWORK = process.env.OPNET_NETWORK || 'regtest'
async function opnetCall(to: string, calldata: string) {
  const r = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ jsonrpc:'2.0', id:1, method:'opnet_call', params:{ to, calldata, network:NETWORK } }) })
  const json = (await r.json()) as { result?: unknown; error?: { message: string } }
  if (json.error) throw new Error(json.error.message)
  return json.result
}
daoRouter.get('/', async (_req: Request, res: Response) => {
  try {
    let totalDAOs = 0
    if (FACTORY) { const result = (await opnetCall(FACTORY,'0x5b83f0b9').catch(()=>null)) as {count?:string}|null; if (result?.count) totalDAOs = parseInt(result.count, 16) }
    res.json({ factoryAddress:FACTORY, network:NETWORK, rpcUrl:RPC, totalDAOs })
  } catch(e: unknown) { res.status(500).json({ error:(e as Error).message }) }
})
daoRouter.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(String(req.params['id'] ?? ''), 10)
  if (!id || id < 1) { res.status(400).json({ error:'Invalid DAO id' }); return }
  if (!FACTORY) { res.status(503).json({ error:'FACTORY_ADDRESS not configured' }); return }
  try {
    const result = await opnetCall(FACTORY, '0x2628c452' + id.toString(16).padStart(64,'0'))
    res.json(result || { error:'Not found' })
  } catch(e: unknown) { res.status(500).json({ error:(e as Error).message }) }
})
