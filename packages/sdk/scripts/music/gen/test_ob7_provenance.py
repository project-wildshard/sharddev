"""A later valid source edit must not inherit an earlier model comparison."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import wave

from ob7_build import REPO, read_compared_take, shared_bed, replace_output_row, publication_fit


class ComparedTakeTest(unittest.TestCase):
    def test_below_top_five_requires_the_exact_reviewed_source_and_measurement(self) -> None:
        match = {"rank": 6, "p": .02, "seed": "701", "sourceWaveSha256": "a" * 64,
                 "sourceMetadataSha256": "b" * 64}
        family = 'bed.fixture.ambience'
        decisions = {"ruling": "G872 2026-11-04", "label": "best measured, below top-5",
                     "families": {family: {"engine": "moss", **match}}}
        self.assertEqual(publication_fit(family, 'moss', match, decisions)['label'], decisions['label'])
        self.assertIsNone(publication_fit(family, 'moss', {**match, 'rank': 5}, {}))
        for field, value in [('rank', 7), ('p', .03), ('seed', '702'),
                             ('sourceWaveSha256', 'c' * 64), ('sourceMetadataSha256', 'd' * 64)]:
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'no exact fit decision'):
                publication_fit(family, 'moss', {**match, field: value}, decisions)
        for name, engine, decision in [('other', 'moss', decisions), (family, 'medium', decisions), (family, 'moss', {})]:
            with self.assertRaisesRegex(ValueError, 'no exact fit decision'):
                publication_fit(name, engine, match, decision)

    def test_activation_preserves_literal_peer_keys_and_only_changes_its_row(self) -> None:
        before = '{\n  "outputs": [\n    {"idea":"peer","pois":[],"pois":[1]},\n    {"idea":"own","manifest":{}},\n    {"idea":"later","value":2}\n  ]\n}\n'
        after = replace_output_row(before, 'own', {'idea': 'own', 'manifest': {'audio': True}})
        self.assertIn('{"idea":"peer","pois":[],"pois":[1]}', after)
        self.assertIn('{"idea":"later","value":2}', after)
        self.assertEqual(json.loads(after)['outputs'][1], {'idea': 'own', 'manifest': {'audio': True}})
        with self.assertRaisesRegex(ValueError, 'one literal output row'):
            replace_output_row(before, 'missing', {})

    def test_shared_bed_keeps_the_canonical_file_and_qualified_provenance(self) -> None:
        source = REPO / 'public/assets/sfx/coral-drift/sfx.json'
        data = json.loads(source.read_text())
        original = data['beds']['coral-drift.ambience']
        asset = source.parent / original['file']
        entry, proof, size = shared_bed({'set': 'coral-drift', 'bed': 'coral-drift.ambience', 'gap': 'No rain'})
        self.assertEqual(entry['file'], {'set': 'coral-drift', 'file': asset.name})
        self.assertEqual(entry['loopStart'], original['loopStart'])
        self.assertEqual(entry['loopEnd'], original['loopEnd'])
        self.assertEqual(proof['reuse']['recordingSha256'], hashlib.sha256(asset.read_bytes()).hexdigest())
        self.assertEqual(size, asset.stat().st_size)
        self.assertLessEqual(proof['comparison'][proof['winner']]['rank'], 5)
        with self.assertRaisesRegex(ValueError, 'confined catalogue'):
            shared_bed({'set': '../coral-drift', 'bed': 'coral-drift.ambience', 'gap': 'No rain'})
        with self.assertRaisesRegex(ValueError, 'direct existing recording'):
            shared_bed({'set': 'coral-drift', 'bed': 'missing', 'gap': 'No rain'})

    def test_changed_wave_or_metadata_refuses(self) -> None:
        with tempfile.TemporaryDirectory(dir=REPO / "tmp", prefix="ob7-source-control-") as folder:
            wav = Path(folder) / "701.wav"
            with wave.open(str(wav), "wb") as stream:
                stream.setparams((1, 2, 48000, 0, "NONE", "not compressed"))
                stream.writeframes(b"\x01\x00" * 480)
            side = wav.with_suffix(".json")
            side.write_text(json.dumps({"seed": 701, "model": "MOSS-SoundEffect v2"}))
            original = wav.read_bytes()
            comparison = {"sourceWaveSha256": hashlib.sha256(original).hexdigest(),
                          "sourceMetadataSha256": hashlib.sha256(side.read_bytes()).hexdigest()}
            self.assertEqual(read_compared_take(wav, comparison)["source"]["seed"], 701)
            wav.write_bytes(original[:-2] + b"\x02\x00")
            with self.assertRaisesRegex(ValueError, "source changed"):
                read_compared_take(wav, comparison)
            wav.write_bytes(original)
            side.write_text(json.dumps({"seed": 702, "model": "MOSS-SoundEffect v2"}))
            with self.assertRaisesRegex(ValueError, "source changed"):
                read_compared_take(wav, comparison)


if __name__ == "__main__":
    unittest.main()
