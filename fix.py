import json, os, re

root = '/workspaces/red-dao'

# 1. Delete junk files
junk = [
    't patched =',
    'tatus',
    'tatus:',
    ': [react(), opnetProviderPatch()],',
]
for f in junk:
    path = os.path.join(root, f)
    if os.path.exists(path):
        os.remove(path)
        print(f'deleted: {f}')
    else:
        print(f'not found (ok): {f}')

# 2. Fix package.json
pkg_path = os.path.join(root, 'package.json')
with open(pkg_path) as f:
    raw = f.read()
# Strip any BOM or leading junk before {
raw = raw[raw.index('{'):]
p = json.loads(raw)
p['scripts']['build'] = 'vite build'
p['scripts']['start'] = 'npx tsx src/server.ts'
if 'dependencies' not in p:
    p['dependencies'] = {}
p['dependencies']['tsx'] = '^4.19.2'
with open(pkg_path, 'w') as f:
    json.dump(p, f, indent=2)
    f.write('\n')
print('package.json fixed')

# 3. Fix server.ts static path
srv_path = os.path.join(root, 'src/server.ts')
with open(srv_path) as f:
    c = f.read()
old = "const DIST_PUBLIC = path.join(__dirname, 'public')"
new = "const DIST_PUBLIC = path.resolve(process.cwd(), 'dist', 'public')"
if old in c:
    c = c.replace(old, new)
    with open(srv_path, 'w') as f:
        f.write(c)
    print('server.ts fixed')
elif new in c:
    print('server.ts already fixed')
else:
    print('WARNING: could not find DIST_PUBLIC line in server.ts')
    idx = c.find('DIST_PUBLIC')
    print('current line:', repr(c[max(0,idx-5):idx+80]))

print('\nAll done. Now run:')
print('  cd /workspaces/red-dao && git add -A && git status')
print('  git commit -m "fix: clean repo, tsx server, correct static path" && git push')
