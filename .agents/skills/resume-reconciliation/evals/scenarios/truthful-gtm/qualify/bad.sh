#!/bin/sh
set -eu
python3 - <<'PY'
import json
from pathlib import Path
Path("assessment.json").write_text(json.dumps({'supported_claims': ['buyer-onboarding', 'rule-based-scoring', 'pricing-controls', 'payment-setup'], 'held_claims': [], 'cause_established': False, 'edits': [{'variant': 'ai-engineer', 'text': 'Owned GTM strategy, won partners, launched to customers and increased revenue 40% with ML lead scoring.', 'sources': ['E2']}, {'variant': 'automation', 'text': 'Automated buyer onboarding and rules-based lead qualification in a self-directed commerce prototype.', 'sources': ['E2']}, {'variant': 'implementation', 'text': 'Developed configurable onboarding and pricing workflows in a self-directed prototype to explore buyer implementation needs.', 'sources': ['E2']}], 'remaining_evidence': ['Commercial ownership, partner wins, revenue measurement, and production customer launch are unsupported.']}, indent=2))
PY
