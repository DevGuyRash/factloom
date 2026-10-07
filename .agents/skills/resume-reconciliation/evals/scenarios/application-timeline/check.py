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
    employers={'A':'Example Labs','B':'Example Labs','C':'Fiction Systems','D':'Demo Remote','E':'Sample Works','F':'Placeholder Co'}
    aliases={k:k for k in employers}
    aliases.update({f'{v} / {k}':k for k,v in employers.items()})
    a={}
    for x in d['applications']:
        k=aliases.get(x['requisition'])
        if k is None or k in a or x.get('employer',employers[k])!=employers[k]:
            return {'artifact_valid':True,'identities_and_latest_status':False,'events_preserved':False,'version_confidence':False,'eligibility_not_wording':d.get('resume_edit_fixes_eligibility') is False}
        a[k]=x
    expected={'A':('rejected',['M1','M2']),'B':('progressed',['M3']),'C':('pending',['M4']),'D':('eligibility_restriction',['M5']),'E':('role_closed',['M6']),'F':('progressed',['M7','M8'])}
    return {
      'artifact_valid':True,
      'identities_and_latest_status':set(a)==set(expected) and all(a[k]['status']==v[0] for k,v in expected.items()),
      'events_preserved':all(a[k]['message_ids']==v[1] for k,v in expected.items()),
      'version_confidence':a['A']['resume_identity']=='recorded_variant' and all(a[k]['resume_identity']=='unknown' for k in a if k!='A'),
      'eligibility_not_wording':d['resume_edit_fixes_eligibility'] is False,
    }
