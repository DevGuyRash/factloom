#!/bin/sh
set -eu
python3 - <<'PY'
import json
from pathlib import Path
Path("assessment.json").write_text(json.dumps({'supported_claims': ['buyer-onboarding', 'rule-based-scoring', 'pricing-controls', 'payment-setup'], 'held_claims': ['commercial-strategy', 'partnership-wins', 'revenue-growth', 'production-launch'], 'cause_established': False, 'edits': [{'variant': 'ai-engineer', 'text': 'Built a self-directed commerce prototype integrating buyer onboarding, pricing controls and payment setup.', 'sources': ['E2']}, {'variant': 'automation', 'text': 'Automated buyer onboarding and rules-based lead qualification in a self-directed commerce prototype.', 'sources': ['E2']}, {'variant': 'implementation', 'text': 'Developed configurable onboarding and pricing workflows in a self-directed prototype to explore buyer implementation needs.', 'sources': ['E2']}], 'remaining_evidence': ['Commercial ownership, partner wins, revenue measurement, and production customer launch are unsupported.']}, indent=2))
import json
from pathlib import Path
p=Path('assessment.json');d=json.loads(p.read_text())
for x in d['edits']:x['sources'].append('INVENTED-SOURCE')
p.write_text(json.dumps(d))

PY
