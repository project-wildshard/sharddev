# Two CI proofs get room for hosted runners

Main's ci was red on five of its last six runs, each time on
`generation-cli.test.mjs`: the real `wildshard new` child hit its 8 s
kill (status null) on hosted runners, while it finishes in about 3 s on
the Mac mini. One run also cancelled Mossgate's boot, walk and resume at
9.5 s, where Ink-cel and Pastel take about 7 s. Neither is a budget; both
were a guess at "a hang". The child now gets 30 s and the template-play
cases 30 s each, so a real hang still fails and a slow runner does not.
