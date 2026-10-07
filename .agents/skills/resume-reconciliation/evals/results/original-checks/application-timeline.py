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
    a={x['requisition']:x for x in d['applications']}
    expected={'A':('rejected',['M1','M2']),'B':('progressed',['M3']),'C':('pending',['M4']),'D':('eligibility_restriction',['M5']),'E':('role_closed',['M6']),'F':('progressed',['M7','M8'])}
    return {
      'artifact_valid':True,
      'identities_and_latest_status':set(a)==set(expected) and all(a[k]['status']==v[0] for k,v in expected.items()),
      'events_preserved':all(a[k]['message_ids']==v[1] for k,v in expected.items()),
      'version_confidence':a['A']['resume_identity']=='recorded_variant' and all(a[k]['resume_identity']=='unknown' for k in a if k!='A'),
      'eligibility_not_wording':d['resume_edit_fixes_eligibility'] is False,
    }
