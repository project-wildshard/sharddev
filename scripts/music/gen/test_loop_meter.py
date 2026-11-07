"""Exercise real seam analysis for the fairground's triple meter."""
import unittest

import numpy as np

from analyze import loop_seam


class LoopMeterTest(unittest.TestCase):
    def test_waltz_and_existing_common_time(self) -> None:
        sr = 22050
        t = np.arange(32 * sr) / sr
        audio = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        waltz = loop_seam(audio, sr, 120, 32, 3)
        common = loop_seam(audio, sr, 120, 32)
        explicit = loop_seam(audio, sr, 120, 32, 4)
        self.assertGreater(waltz["score"], 0)
        self.assertAlmostEqual(waltz["loop_s"], waltz["bars"] * 1.5, places=2)
        self.assertAlmostEqual(common["loop_s"], common["bars"] * 2, places=2)
        self.assertEqual(common, explicit)

    def test_invalid_meter_refuses(self) -> None:
        for meter in (0, -1, 13, 3.5, True):
            with self.assertRaisesRegex(ValueError, "Loop meter"):
                loop_seam(np.zeros(1), 22050, 120, 0, meter)


if __name__ == "__main__":
    unittest.main()
