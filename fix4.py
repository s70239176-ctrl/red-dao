import re

path = '/workspaces/red-dao/client/src/App.tsx'
with open(path) as f:
    c = f.read()

changes = 0

# Show current handleVote for debugging
hv = c.find('const handleVote')
print('=== CURRENT handleVote (first 600 chars) ===')
print(repr(c[hv:hv+600]))
print()

# Show current propose area
pa = c.find('notify(\'Proposal submitted')
print('=== CURRENT propose area (200 chars before) ===')
print(repr(c[max(0,pa-400):pa+100]))
print()

# FIX 1: Replace p.target with factory.factoryAddress in handleVote
# Find the exact line by searching for p.target in handleVote context
hv_block = c[hv:hv+2000]
if 'p.target' in hv_block:
    # Replace just this occurrence (inside handleVote)
    hv_end = hv + 2000
    before = c[:hv]
    block = c[hv:hv_end]
    after = c[hv_end:]
    
    block = block.replace(
        "const contractAddr=(p.target||'').trim()",
        "if(!factory){notify('No DAO deployed \u2014 go to Deploy tab first',false);return}\n    const contractAddr=(factory.factoryAddress||'').trim()"
    )
    block = block.replace(
        "if(!contractAddr){notify('Proposal has no target address',false);return}",
        "if(!contractAddr){notify('No DAO contract address configured',false);return}"
    )
    # Fix deps array
    block = re.sub(r'\},\[address,notify\]\)', '},[address,factory,notify])', block, count=1)
    
    c = before + block + after
    changes += 1
    print('FIX 1 applied: handleVote uses factory.factoryAddress')
elif 'factory.factoryAddress' in hv_block:
    print('FIX 1 already applied')
else:
    print('FIX 1 FAILED: p.target not found in handleVote block')
    print('handleVote block:', repr(hv_block[:300]))

# FIX 2: ProposeTab - find and fix however the propose submission looks
# Look for the provider.getPublicKeyInfo(daoAddr) area - if missing, add it
propose_fn = c.find('async function handlePropose')
if propose_fn < 0:
    propose_fn = c.find('const handlePropose')
if propose_fn < 0:
    propose_fn = c.find('async function submitProposal')

print(f'\nPropose function at index: {propose_fn}')
if propose_fn >= 0:
    propose_block = c[propose_fn:propose_fn+1500]
    print('=== PROPOSE BLOCK ===')
    print(repr(propose_block[:600]))

with open(path, 'w') as f:
    f.write(c)

print(f'\n{changes} changes applied.')
