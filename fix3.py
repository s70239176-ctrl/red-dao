import re, sys

path = '/workspaces/red-dao/client/src/App.tsx'
with open(path) as f:
    c = f.read()

changes = 0

# FIX 1: handleVote - find by regex and replace the contractAddr line
# Current: const contractAddr=(p.target||'').trim()
# Replace entire handleVote body up to the signAndBroadcast call
old = "    const contractAddr=(p.target||'').trim()\n    if(!contractAddr){notify('Proposal has no target address',false);return}"
new = """    if(!factory){notify('No DAO deployed \u2014 go to Deploy tab first',false);return}
    const contractAddr=(factory.factoryAddress||'').trim()
    if(!contractAddr){notify('No DAO contract address configured',false);return}"""

if old in c:
    c = c.replace(old, new)
    changes += 1
    print('FIX 1a applied: contractAddr uses factory.factoryAddress')
else:
    print('FIX 1a not found, trying variant...')
    # Try finding just the target line
    idx = c.find("const contractAddr=(p.target")
    if idx >= 0:
        line_end = c.find('\n', idx)
        next_line_end = c.find('\n', line_end+1)
        print('Found at idx', idx, ':', repr(c[idx:next_line_end]))
    else:
        print('contractAddr line not found at all')

# FIX 1b: add factory to useCallback deps
old_dep = "},[address,notify])"
new_dep = "},[address,factory,notify])"
# Only replace inside handleVote (find it after handleVote definition)
hv_idx = c.find('const handleVote=useCallback')
if hv_idx >= 0:
    # Find the closing deps array for this specific callback
    dep_idx = c.find(old_dep, hv_idx)
    if dep_idx >= 0 and dep_idx < hv_idx + 3000:
        c = c[:dep_idx] + new_dep + c[dep_idx+len(old_dep):]
        changes += 1
        print('FIX 1b applied: added factory to useCallback deps')

# FIX 2: sendInteraction helper - if it exists, remove the challenge+getPublicKeyInfo version
# and replace vote/propose calls to use inline signAndBroadcast pattern
# Find the sendInteraction function and remove it (we inline everything)
si_start = c.find('\nasync function sendInteraction(')
si_end = c.find('\nfunction encodePropose(')
if si_start >= 0 and si_end >= 0:
    old_fn = c[si_start:si_end]
    c = c[:si_start] + '\n' + c[si_end:]
    changes += 1
    print('FIX 2 applied: removed sendInteraction helper function')

# FIX 3: ProposeTab - replace the sendInteraction call with inline version
old_propose = "      await sendInteraction(provider, addr, daoAddr, Buffer.from(calldata))"
new_propose = """      const utxos2 = await provider.utxoManager.getUTXOs({address:addr,mergePendingUTXOs:false,filterSpentUTXOs:true})
      if(!utxos2?.length) throw new Error(`No UTXOs for ${addr} \u2014 fund wallet with testnet BTC`)
      notify('Fetching contract key\u2026')
      const contractPubKey2 = await (provider as any).getPublicKeyInfo(daoAddr)
      if(!contractPubKey2) throw new Error('Contract not indexed on-chain: ' + daoAddr)
      notify('Signing\u2026')
      await (window.opnet as any).web3.signAndBroadcastInteraction({
        from:addr, to:daoAddr, contract:(contractPubKey2 as any).toHex(),
        calldata:Buffer.from(calldata), utxos:utxos2, feeRate:10, priorityFee:330n, gasSatFee:1000n,
      })"""

if old_propose in c:
    c = c.replace(old_propose, new_propose)
    changes += 1
    print('FIX 3 applied: ProposeTab inline signAndBroadcast')
else:
    print('FIX 3 not found - checking for existing inline version...')
    if 'getPublicKeyInfo(daoAddr)' in c:
        print('  Already has getPublicKeyInfo(daoAddr) - may already be fixed')
    else:
        idx = c.find('notify(\'Proposal submitted')
        print('  Found propose area at:', idx, repr(c[max(0,idx-200):idx]))

# FIX 4: handleVote - replace the broken getPublicKeyInfo+signAndBroadcast if it has old pattern
old_vote_inner = """      const contractPubKey = await provider.getPublicKeyInfo(contractAddr)
      if(!contractPubKey) throw new Error('Contract not found on-chain: ' + contractAddr)
      await (window.opnet as any).web3.signAndBroadcastInteraction({
        from:addr, to:contractAddr, contract:(contractPubKey as any).toHex(),
        calldata, utxos, feeRate:10, priorityFee:330n, gasSatFee:1000n,
      })"""
new_vote_inner = """      const contractPubKey = await (provider as any).getPublicKeyInfo(contractAddr)
      if(!contractPubKey) throw new Error('Contract not indexed on-chain yet: ' + contractAddr)
      notify('Signing\u2026')
      await (window.opnet as any).web3.signAndBroadcastInteraction({
        from:addr, to:contractAddr, contract:(contractPubKey as any).toHex(),
        calldata, utxos, feeRate:10, priorityFee:330n, gasSatFee:1000n,
      })"""
if old_vote_inner in c:
    c = c.replace(old_vote_inner, new_vote_inner)
    changes += 1
    print('FIX 4 applied: fixed provider.getPublicKeyInfo cast')

with open(path, 'w') as f:
    f.write(c)

print(f'\n{changes} changes applied.')
print('Run: cd /workspaces/red-dao && git add client/src/App.tsx && git commit -m "fix: factory address for voting, inline signAndBroadcast" && git push')
