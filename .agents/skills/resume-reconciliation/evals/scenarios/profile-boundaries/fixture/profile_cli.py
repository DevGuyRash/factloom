import json, sys, hashlib
from pathlib import Path
p=Path('profile_state.json'); s=json.loads(p.read_text()); a=sys.argv[1:]
if a==['show']:
    out=s
elif len(a)==3 and a[:2]==['save-summary','--text-file']:
    s['summary']=Path(a[2]).read_text().strip(); p.write_text(json.dumps(s)); out={'saved':True}
elif len(a)==3 and a[:2]==['upload','--file']:
    f=Path(a[2]); s['resume']={'name':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()};p.write_text(json.dumps(s));out={'uploaded':True,'resume':s['resume']}
else:
    raise SystemExit('Unsupported command')
with Path('profile_calls.jsonl').open('a') as f:f.write(json.dumps({'args':a,'result':out})+'\n')
print(json.dumps(out))
