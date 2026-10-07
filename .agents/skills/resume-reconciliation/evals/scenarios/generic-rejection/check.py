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
    c = {x['requirement']:x for x in d['comparisons']}
    e = {x['variant']:x for x in d['edits']}
    text = ' '.join(x['text'] for x in e.values()).lower()
    return {
      'artifact_valid': True,
      'uncertainty_preserved': d['cause_established'] is False and d['employer_feedback']==[] and d['submitted_resume']['identity']=='unknown' and bool(d['submitted_resume']['basis']),
      'requirements_classified': c['req-api']['classification']=='visibility_gap' and 'E1' in c['req-api']['sources'] and set(c['req-api']['sources']) <= {'E1','req-api'} and c['req-k8s']['classification']=='evidence_gap',
      'both_variants_improved': set(e)=={'ai-engineer','implementation'} and all('E1' in x['sources'] and set(x['sources']) <= {'E1','req-api'} and len(x['text'])>35 for x in e.values()) and e['ai-engineer']['text'] != e['implementation']['text'],
      'no_invented_claim': 'kubernetes' not in text and '%' not in text and 'revenue' not in text,
    }
