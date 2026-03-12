import os

files = [
    '/workspaces/red-dao/src/server.ts',
    '/workspaces/red-dao/src/routes/dao.ts',
    '/workspaces/red-dao/src/routes/proposals.ts',
    '/workspaces/red-dao/src/routes/relayer.ts',
    '/workspaces/red-dao/client/src/App.tsx',
]

for p in files:
    try:
        with open(p) as f:
            c = f.read()
        n = c.replace('regtest.opnet.org', 'testnet.opnet.org')
        if n != c:
            with open(p, 'w') as f:
                f.write(n)
            print('reverted:', p)
        else:
            print('no change:', p)
    except Exception as e:
        print('skip:', p, e)

print('done')
