import re

path = '/workspaces/red-dao/client/src/App.tsx'
with open(path) as f:
    c = f.read()

# FIX 1: handleVote — use factory.factoryAddress as DAO contract, not p.target
# Also block voting on demo proposals (no factory set)
old_vote = '''  const handleVote=useCallback(async(p:Proposal,support:number)=>{
    if(!isOPWallet(window.opnet)){notify('Connect wallet first',false);return}
    const addr=(address||'').trim()
    if(!addr){notify('Wallet address not loaded \u2014 disconnect and reconnect',false);return}
    const contractAddr=(p.target||'').trim()
    if(!contractAddr){notify('Proposal has no target address',false);return}
    notify('Preparing transaction\u2026')
    try{
      notify('Step 1: loading modules\u2026')
      notify('Step 2: fetching UTXOs\u2026')
      const provider=new JSONRpcProvider('https://testnet.opnet.org')
      const utxos=await provider.utxoManager.getUTXOs({address:addr,mergePendingUTXOs:false,filterSpentUTXOs:true})
      if(!utxos?.length) throw new Error(`No UTXOs for ${addr} \u2014 fund wallet with testnet BTC first`)
      notify(`Step 3: signing (${utxos.length} UTXOs)\u2026`)
      const calldata=Buffer.from(support===0?encodeExec(p.proposalId):encodeVote(p.proposalId,support))
      notify('Step 3: fetching contract key\u2026')
      const contractPubKey = await provider.getPublicKeyInfo(contractAddr)
      if(!contractPubKey) throw new Error('Contract not found on-chain: ' + contractAddr)
      await (window.opnet as any).web3.signAndBroadcastInteraction({
        from:addr, to:contractAddr, contract:(contractPubKey as any).toHex(),
        calldata, utxos, feeRate:10, priorityFee:330n, gasSatFee:1000n,
      })
      notify(`${support===0?'Execute':['','FOR','AGAINST','ABSTAIN'][support]} transaction broadcast \u2713`)
    }catch(e:unknown){
      const err=e as Error
      console.error('[DAO vote error]',err)
      notify(err.message??'Transaction failed',false)
    }
  },[address,notify])'''

new_vote = '''  const handleVote=useCallback(async(p:Proposal,support:number)=>{
    if(!isOPWallet(window.opnet)){notify('Connect wallet first',false);return}
    const addr=(address||'').trim()
    if(!addr){notify('Wallet address not loaded \u2014 disconnect and reconnect',false);return}
    if(!factory){notify('No DAO deployed yet \u2014 go to Deploy tab first',false);return}
    const contractAddr=(factory.factoryAddress||'').trim()
    if(!contractAddr){notify('No DAO contract address configured',false);return}
    notify('Preparing transaction\u2026')
    try{
      notify('Fetching UTXOs\u2026')
      const provider=new JSONRpcProvider('https://testnet.opnet.org')
      const utxos=await provider.utxoManager.getUTXOs({address:addr,mergePendingUTXOs:false,filterSpentUTXOs:true})
      if(!utxos?.length) throw new Error(`No UTXOs for ${addr} \u2014 fund wallet with testnet BTC first`)
      const calldata=Buffer.from(support===0?encodeExec(p.proposalId):encodeVote(p.proposalId,support))
      notify('Fetching contract key\u2026')
      const contractPubKey = await (provider as any).getPublicKeyInfo(contractAddr)
      if(!contractPubKey) throw new Error('Contract not indexed on-chain yet: ' + contractAddr)
      notify('Signing\u2026')
      await (window.opnet as any).web3.signAndBroadcastInteraction({
        from:addr, to:contractAddr, contract:(contractPubKey as any).toHex(),
        calldata, utxos, feeRate:10, priorityFee:330n, gasSatFee:1000n,
      })
      notify(`${support===0?'Execute':['','FOR','AGAINST','ABSTAIN'][support]} broadcast \u2713`)
    }catch(e:unknown){
      const err=e as Error
      console.error('[DAO vote error]',err)
      notify(err.message??'Transaction failed',false)
    }
  },[address,factory,notify])'''

if old_vote in c:
    c = c.replace(old_vote, new_vote)
    print('FIX 1 applied: handleVote uses factory.factoryAddress')
else:
    print('FIX 1 NOT FOUND - handleVote snippet mismatch')
    idx = c.find('const handleVote')
    print('Current start:', repr(c[idx:idx+200]))

# FIX 2: ProposeTab — replace broken sendInteraction with direct getPublicKeyInfo + signAndBroadcast
old_propose_body = '''      const provider = new JSONRpcProvider('https://testnet.opnet.org')
      await sendInteraction(provider, addr, daoAddr, Buffer.from(calldata))
      setTxid('broadcast \u2713')
      notify('Proposal submitted \u2713')'''

new_propose_body = '''      const provider = new JSONRpcProvider('https://testnet.opnet.org')
      const utxos = await provider.utxoManager.getUTXOs({address:addr,mergePendingUTXOs:false,filterSpentUTXOs:true})
      if(!utxos?.length) throw new Error(`No UTXOs for ${addr} \u2014 fund wallet with testnet BTC`)
      notify('Fetching contract key\u2026')
      const contractPubKey = await (provider as any).getPublicKeyInfo(daoAddr)
      if(!contractPubKey) throw new Error('Contract not indexed on-chain yet: ' + daoAddr)
      notify('Signing\u2026')
      await (window.opnet as any).web3.signAndBroadcastInteraction({
        from:addr, to:daoAddr, contract:(contractPubKey as any).toHex(),
        calldata:Buffer.from(calldata), utxos, feeRate:10, priorityFee:330n, gasSatFee:1000n,
      })
      setTxid('broadcast \u2713')
      notify('Proposal submitted \u2713')'''

if old_propose_body in c:
    c = c.replace(old_propose_body, new_propose_body)
    print('FIX 2 applied: ProposeTab uses getPublicKeyInfo + signAndBroadcast directly')
else:
    print('FIX 2 NOT FOUND - ProposeTab snippet mismatch')
    idx = c.find('sendInteraction(provider')
    print('Current:', repr(c[max(0,idx-50):idx+200]))

with open(path, 'w') as f:
    f.write(c)

print('\nDone. Now run:')
print('  cd /workspaces/red-dao && git add client/src/App.tsx && git commit -m "fix: use factory address for voting, getPublicKeyInfo for contract key" && git push')
