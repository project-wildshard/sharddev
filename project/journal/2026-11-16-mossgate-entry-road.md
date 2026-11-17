# Mossgate edge approaches stay flat

MU15 moved staging to shardfile0.1.0.1 and exposed Mossgate to cook32.
The real cook refused north lane4 after49.10m at y=-0.1501613. The
terrain faded hills out between radius170 and230, leaving a slope
inside the required50m approach. Fade out by195 instead, allowing
55m of flat terrain plus sampling margin. Central authored geometry
stays at the same heights. The strict cook validator is unchanged.

The new test failed on the original terrain and passes with this
change. It samples all23 lanes on all4 edges through54m. Actual
re-upload/full-cook acceptance remains a separate release check.
