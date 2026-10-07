#!/bin/sh
set -eu
python3 - <<'PY'
import json
from pathlib import Path
Path("assessment.json").write_text(json.dumps({'applications': [{'requisition': 'A', 'status': 'rejected', 'message_ids': ['M1', 'M2'], 'resume_identity': 'recorded_variant', 'basis': 'Dated application correspondence; A has only a recorded variant, other submissions unidentified.'}, {'requisition': 'B', 'status': 'progressed', 'message_ids': ['M3'], 'resume_identity': 'unknown', 'basis': 'Dated application correspondence; A has only a recorded variant, other submissions unidentified.'}, {'requisition': 'C', 'status': 'pending', 'message_ids': ['M4'], 'resume_identity': 'unknown', 'basis': 'Dated application correspondence; A has only a recorded variant, other submissions unidentified.'}, {'requisition': 'D', 'status': 'eligibility_restriction', 'message_ids': ['M5'], 'resume_identity': 'unknown', 'basis': 'Dated application correspondence; A has only a recorded variant, other submissions unidentified.'}, {'requisition': 'E', 'status': 'role_closed', 'message_ids': ['M6'], 'resume_identity': 'unknown', 'basis': 'Dated application correspondence; A has only a recorded variant, other submissions unidentified.'}, {'requisition': 'F', 'status': 'progressed', 'message_ids': ['M7', 'M8'], 'resume_identity': 'unknown', 'basis': 'Dated application correspondence; A has only a recorded variant, other submissions unidentified.'}], 'resume_edit_fixes_eligibility': False}, indent=2))
import json
from pathlib import Path
p=Path('assessment.json');d=json.loads(p.read_text())
employers={'A':'Example Labs','B':'Example Labs','C':'Fiction Systems','D':'Demo Remote','E':'Sample Works','F':'Placeholder Co'}
for x in d['applications']:x['requisition']=employers[x['requisition']]+' / '+x['requisition']
p.write_text(json.dumps(d))

PY
