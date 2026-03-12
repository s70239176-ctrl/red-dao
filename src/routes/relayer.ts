import { Router, Request, Response } from 'express'
export const relayerRouter = Router()
interface Transfer { opId:string; recipient:string; amountSats:string; eventType:'DAO'|'Timelock'; contractAddress:string; discoveredAt:number; status:'pending'|'fulfilled'|'failed' }
const queue: Transfer[] = []
const fulfilled = new Set<string>()
relayerRouter.get('/status', (_req: Request, res: Response) => {
  res.json({ status:'running', network:process.env.OPNET_NETWORK||'testnet', pending:queue.filter(t=>t.status==='pending').length, fulfilled:fulfilled.size, safetyCapSats:process.env.RELAYER_MAX_SATS||'10000000', minConfirmations:parseInt(process.env.RELAYER_MIN_CONFS||'3',10) })
})
relayerRouter.get('/queue', (_req: Request, res: Response) => { res.json({ transfers:queue.filter(t=>t.status==='pending') }) })
relayerRouter.post('/queue', (req: Request, res: Response) => {
  const { opId, recipient, amountSats, eventType, contractAddress } = req.body as Partial<Transfer>
  if (!opId||!recipient||!amountSats||!contractAddress) { res.status(400).json({ error:'Missing: opId, recipient, amountSats, contractAddress' }); return }
  if (fulfilled.has(opId)) { res.status(409).json({ error:'Already fulfilled' }); return }
  const t: Transfer = { opId, recipient, amountSats, eventType:eventType||'DAO', contractAddress, discoveredAt:Date.now(), status:'pending' }
  queue.push(t)
  res.status(201).json({ queued:true, transfer:t })
})
