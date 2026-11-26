# Upload numbers and shard versions

RL12 separates the API's catalogue counter from the shard author's version.
The CLI uses the new fields internally and accepts old API replies during the
one-release transition. The request carries equal values under both names
while the deployed API and the pinned integration-test API still read the old
one. Existing publisher scripts can keep using the old flag through rollout.
