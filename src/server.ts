import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import { daoRouter } from './routes/dao'
import { proposalRouter } from './routes/proposals'
import { relayerRouter } from './routes/relayer'
const app = express()
const PORT = parseInt(process.env.PORT || '3000', 10)
const DIST_PUBLIC = path.resolve(process.cwd(), 'dist', 'public')
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc:["'self'"], scriptSrc:["'self'","'unsafe-inline'"], styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com','https://fonts.gstatic.com'], fontSrc:["'self'",'https://fonts.gstatic.com'], connectSrc:["'self'",'https://regtest.opnet.org'], imgSrc:["'self'",'data:'] } } }))
app.use(cors())
app.use(express.json({ limit: '256kb' }))
app.use('/api/dao', daoRouter)
app.use('/api/proposals', proposalRouter)
app.use('/api/relayer', relayerRouter)
app.get('/api/health', (_req, res) => { res.json({ ok:true, version:'1.0.0', network:process.env.OPNET_NETWORK||'testnet', factory:process.env.FACTORY_ADDRESS||null, ts:Date.now() }) })
app.use(express.static(DIST_PUBLIC))
app.get('*', (_req, res) => { res.sendFile(path.join(DIST_PUBLIC, 'index.html')) })
app.listen(PORT, '0.0.0.0', () => { console.log(`[OPNet DAO] Running on :${PORT}`); console.log(`[OPNet DAO] Network : ${process.env.OPNET_NETWORK||'testnet'}`); console.log(`[OPNet DAO] Factory : ${process.env.FACTORY_ADDRESS||'(not set)'}`) })
