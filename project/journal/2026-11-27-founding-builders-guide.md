# The guide says who may upload, and that share links work

meta WWW-REFRESH WW18, J536 (2). api-server now takes uploads from the
team and from invited founding builders (staging only); anyone else is
refused with the wildshard.io waitlist and their account id. GUIDE §1
said upload needed "the team's creator key", which stopped being true
when account keys alone could upload (J372). It now says what is true
after the gate: invited builders upload to staging, production is the
team's, and a new staging slug takes an outer-ring cell (J379).

The share link shipped in engine v0.1.18 (SA36, SA37), so upload's
links lose "(page not built yet)", §5 drops its "Not built yet" list
(both items are live), and the skill's share step names the link. The
new `upload-not-invited` rule turns either gate refusal into a fix.
