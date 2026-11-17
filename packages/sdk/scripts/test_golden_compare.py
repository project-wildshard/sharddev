"""Source-only controls for golden baseline selection; no game or golden writes."""
import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('golden_compare', REPO / 'art/legacy-goldens/compare/compare.py')
compare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(compare)


class GoldenCompareTests(unittest.TestCase):
    def test_subset_rejects_unknown_and_duplicate_shards(self):
        self.assertEqual(compare.selected_shards(SimpleNamespace(shards='nine-dragon-stack')), ['nine-dragon-stack'])
        for names in ('missing', 'nine-dragon-stack,nine-dragon-stack', 'nine-dragon-stack,'):
            with self.assertRaises(ValueError):
                compare.selected_shards(SimpleNamespace(shards=names))

    def test_shardfile_reference_strip_and_page_never_reuse_legacy_verdicts(self):
        (REPO / 'tmp').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='golden-compare-test-', dir=REPO / 'tmp') as folder:
            root = Path(folder)
            previous = compare.ROOT, compare.GOLDENS, compare.RUNS, compare.SET
            try:
                compare.ROOT = str(root)
                compare.GOLDENS = str(root / 'art/legacy-goldens')
                compare.RUNS = str(root / 'runs')
                compare.SET = str(root / 'cameras.json')
                slug = 'nine-dragon-stack'
                camera = {'n': 1, 'name': 'probe'}
                import json
                Path(compare.SET).write_text(json.dumps({'cameras': {slug: [camera]}}))
                for kind, color, height in [('legacy', 'red', 32), ('shardfile', 'blue', 54)]:
                    file = Path(compare.golden(slug, camera, kind))
                    file.parent.mkdir(parents=True)
                    image = Image.new('RGB', (32, height), color)
                    if kind == 'shardfile':
                        image.paste('red', (0, 0, 32, 22))
                    image.save(file, 'JPEG', quality=100, subsampling=0)
                reference = Path(compare.golden(slug, camera, 'shardfile'))
                original = reference.read_bytes()
                self.assertEqual(compare.golden_image(slug, camera, 'shardfile').size, (32, 32))
                raw = root / 'raw' / slug
                raw.mkdir(parents=True)
                Image.new('RGB', (32, 32), 'blue').save(raw / '01-probe-shardfile.png')
                args = SimpleNamespace(raw=[str(root / 'raw')], run='example', shards=slug, against='shardfile',
                                       q=38, captured='unit', out=str(root / 'page.html'))
                with contextlib.redirect_stdout(io.StringIO()):
                    compare.cmd_frames(args)
                    compare.cmd_page(args)
                html = Path(args.out).read_text()
                self.assertIn('SHARDFILE Golden', html)
                self.assertIn('Not reviewed against the SHARDFILE goldens', html)
                self.assertNotIn('LEGACY goldens captured', html)
                self.assertIn('0/1', html)
                self.assertEqual(reference.read_bytes(), original)
            finally:
                compare.ROOT, compare.GOLDENS, compare.RUNS, compare.SET = previous


if __name__ == '__main__':
    unittest.main()
