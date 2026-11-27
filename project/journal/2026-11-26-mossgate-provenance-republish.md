# Republish the current Mossgate template

The older production original is above the API's additive migration
cap and has an identity record. The current chain converts it from
format 0.1.0.4 to 0.1.0.6, which changes the digest. Preserve that
original and ship the current template through the Mossgate workflow.

The version reader now locates the template manifest from the moved
script directory, so the workflow can verify the authored patch bump.
