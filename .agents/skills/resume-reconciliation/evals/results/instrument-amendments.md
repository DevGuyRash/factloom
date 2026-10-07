# ADE instrument amendments

## A1 — source attribution lists, before rescoring

The fixed generic-rejection requirement is that the API requirement is a visibility gap supported by verified fact E1. The original `requirements_classified` check used exact list equality `sources == ['E1']`. The first skill-assisted output also cited `req-api`, the supplied historical posting requirement. Manual reading confirms this is additional legitimate attribution, not an unsupported fact or wrong classification. The task did not forbid citing the posting.

Amend the check to require E1 and allow only E1 and req-api for that comparison. The required behavior stays unchanged. Retain every original result, qualify the amendment with a legitimate extra-source positive and an unsupported-source negative, then rescore all saved runs uniformly. Do not rerun models or modify the skill to erase the original false negative.

The original candidate output also cites req-k8s and E1 for the evidence-gap comparison; it does not claim Kubernetes experience. Manual semantic review must distinguish evidence reviewed from positive evidence of a qualification.

The first GTM outputs from both arms exposed the same problem in `three_distinct_edits`: each cited E2 plus the supplied claim IDs (for example, buyer-onboarding and payment-setup). Permit these supplied claim IDs alongside the still-required E2. Apply the same rule to generic-rejection edits: E1 is required, and the supplied API requirement ID is allowed as additional attribution. This is one source-attribution instrument correction, applied symmetrically to both arms. It is not an observed improvement in the candidate's behavior.

## A2 — composite application identifiers, before rescoring

The final candidate timeline artifact used `Example Labs / A` rather than bare `A` as its requisition label, and the equivalent correct employer/requisition pairs for the other five applications. The task explicitly requires employer+requisition identity, does not enumerate an exact allowed string format for `requisition`, and the output preserves every correct status, message ID, and version-confidence label. The original checker raised a KeyError on these legitimate composite labels.

Allow either the supplied bare requisition ID or the exact supplied employer/requisition pair. Validate an additional employer field when one is present. Do not strip arbitrary prefixes: a wrong employer paired with the right letter must fail. Qualify the amendment with a correct composite-identity positive and a wrong-employer negative, preserve original results, and rescore uniformly. This correction addresses representation, not an application-identity mistake by the model.
