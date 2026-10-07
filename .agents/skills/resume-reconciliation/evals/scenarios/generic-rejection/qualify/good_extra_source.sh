#!/bin/sh
set -eu
python3 - <<'PY'
import json
from pathlib import Path
Path("assessment.json").write_text(json.dumps({'cause_established': False, 'employer_feedback': [], 'submitted_resume': {'identity': 'unknown', 'basis': 'No submitted artifact or variant record.'}, 'comparisons': [{'requirement': 'req-api', 'classification': 'visibility_gap', 'sources': ['E1']}, {'requirement': 'req-k8s', 'classification': 'evidence_gap', 'sources': []}], 'edits': [{'variant': 'ai-engineer', 'text': 'AI engineer who implemented production API integrations and improved error handling from client feedback.', 'sources': ['E1']}, {'variant': 'implementation', 'text': 'Implementation specialist translating client requirements into production API integrations and incorporating delivery feedback.', 'sources': ['E1']}]}, indent=2))
import json
from pathlib import Path
p=Path('assessment.json');d=json.loads(p.read_text())
for x in d['edits']:x['sources'].append('req-api')
d['comparisons'][0]['sources'].append('req-api')
p.write_text(json.dumps(d))

PY
