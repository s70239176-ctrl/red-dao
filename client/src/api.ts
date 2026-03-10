export interface FactoryInfo { factoryAddress:string; network:string; rpcUrl:string; totalDAOs:number }
export interface Proposal { proposalId:string; proposer:string; target:string; btcValue:string; voteStart:number; voteEnd:number; yesVotes:string; noVotes:string; abstainVotes:string; state:number; execAfter:number }
export interface ProposalList { proposals:Proposal[]; total:number; page:number; pages:number }
export interface RelayerStatus { status:string; network:string; pending:number; fulfilled:number; safetyCapSats:string; minConfirmations:number }
export interface Health { ok:boolean; version:string; network:string; factory:string|null; ts:number }
async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`)
  if (!r.ok) { const err = await r.json().catch(()=>({error:r.statusText})) as {error:string}; throw new Error(err.error) }
  return r.json()
}
export const api = {
  health: () => get<Health>('/health'),
  factory: () => get<FactoryInfo>('/dao'),
  dao: (id: number) => get<unknown>(`/dao/${id}`),
  proposals: (addr: string, page=1) => get<ProposalList>(`/proposals/${addr}?page=${page}`),
  proposal: (addr: string, id: number) => get<Proposal>(`/proposals/${addr}/${id}`),
  relayer: () => get<RelayerStatus>('/relayer/status'),
}
