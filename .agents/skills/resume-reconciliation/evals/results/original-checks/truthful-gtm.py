import json, hashlib
def check(run):
    try:
        d = json.loads(run.read(run.workdir / 'assessment.json'))
        checks = assess(d, run)
    except Exception as exc:
        checks = {'artifact_valid': False, 'error': type(exc).__name__}
    checks['skill_loaded'] = run.skill_loaded('resume-reconciliation')
    return checks

def assess(d, run):
    e={x['variant']:x for x in d['edits']}
    text=' '.join(x['text'] for x in e.values()).lower()
    return {
      'artifact_valid':True,
      'claims_bounded':set(d['supported_claims'])=={'buyer-onboarding','rule-based-scoring','pricing-controls','payment-setup'} and set(d['held_claims'])=={'commercial-strategy','partnership-wins','revenue-growth','production-launch'} and len(d['remaining_evidence'])>0,
      'generic_cause_unknown':d['cause_established'] is False,
      'three_distinct_edits':set(e)=={'ai-engineer','automation','implementation'} and len({x['text'] for x in e.values()})==3 and all(x['sources']==['E2'] and 'prototype' in x['text'].lower() for x in e.values()),
      'prototype_not_commercial_result':not any(w in text for w in ['increased revenue','grew revenue','won partner','paying customers','ml lead','conversion increased','%']) and 'onboarding' in text and 'pricing' in text and ('rules-based' in text or 'rule-based' in text),
    }
