import unittest

from animalhelper_ai.image_quality import assess_identity_crop


class ImageQualityTests(unittest.TestCase):
    def test_policy_accepts_only_one_face_with_confirmed_redaction(self) -> None:
        result = assess_identity_crop(
            width=0.5,
            height=0.5,
            face_count=1,
            quality=0.9,
            padding=0.1,
            exif_present=False,
            metadata_present=False,
            redaction_confirmed=True,
        )
        self.assertEqual(result.status, "accepted")

    def test_policy_rejects_zero_or_multiple_faces_without_claiming_detector_capability(self) -> None:
        for face_count, reason in ((0, "zero_faces"), (2, "multiple_faces")):
            result = assess_identity_crop(
                width=0.5, height=0.5, face_count=face_count, quality=0.9, padding=0.1,
                exif_present=False, metadata_present=False, redaction_confirmed=True,
            )
            self.assertEqual(result.status, "rejected")
            self.assertIn(reason, result.reason_codes)
        self.assertNotIn("detected", result.reason_text.lower())

    def test_policy_fails_closed_for_metadata_redaction_and_low_quality(self) -> None:
        result = assess_identity_crop(
            width=0.01, height=0.5, face_count=1, quality=0.2, padding=0.5,
            exif_present=True, metadata_present=True, redaction_confirmed=False,
        )
        self.assertEqual(result.status, "rejected")
        self.assertTrue({"tiny_crop", "low_quality", "excess_padding", "metadata_present", "redaction_unconfirmed"}.issubset(result.reason_codes))

    def test_adversarial_runtime_types_never_reach_acceptance(self) -> None:
        adversarial = (
            {"redaction_confirmed": "false"},
            {"width": True},
            {"height": False},
            {"quality": True},
            {"padding": False},
            {"quality": float("inf")},
            {"padding": -0.1},
            {"metadata_present": "false"},
        )
        base = {
            "width": 0.5, "height": 0.5, "face_count": 1, "quality": 0.9,
            "padding": 0.1, "exif_present": False, "metadata_present": False,
            "redaction_confirmed": True,
        }
        for overrides in adversarial:
            with self.subTest(overrides=overrides):
                try:
                    result = assess_identity_crop(**{**base, **overrides})
                except (TypeError, ValueError):
                    continue
                self.assertNotEqual(result.status, "accepted")
        unknown_metadata = assess_identity_crop(**{**base, "metadata_present": None})
        self.assertNotEqual(unknown_metadata.status, "accepted")

    def test_unknown_metadata_or_redaction_is_rejected(self) -> None:
        result = assess_identity_crop(
            width=0.5, height=0.5, face_count=1, quality=0.9, padding=0.1,
            exif_present=False, metadata_present=None, redaction_confirmed=True,
        )
        self.assertNotEqual(result.status, "accepted")


if __name__ == "__main__":
    unittest.main()
