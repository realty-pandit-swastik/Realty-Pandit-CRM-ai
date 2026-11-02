import hashlib
import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "release-safety.py"
spec = importlib.util.spec_from_file_location("release_safety", SOURCE)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
package_spec = importlib.util.spec_from_file_location("package_release", SOURCE.parent / "package-release.py")
packager = importlib.util.module_from_spec(package_spec)
package_spec.loader.exec_module(packager)


class ArtifactSafety(unittest.TestCase):
    def archive(self, extra=(), omit=None):
        folder = tempfile.TemporaryDirectory(prefix="rp-artifact-test-")
        self.addCleanup(folder.cleanup)
        filename = pathlib.Path(folder.name) / "release.tgz"
        entries = [(f"agents/{name}/package.json", b"{}", None) for name in guard.COMPONENTS]
        entries += [(f"deploy/{name}", b"fixture", None) for name in guard.HELPERS if name != omit]
        entries += list(extra)
        with tarfile.open(filename, "w:gz") as output:
            for name, content, kind in entries:
                item = tarfile.TarInfo(name)
                item.mode = 0o644
                if kind:
                    item.type = kind
                    item.linkname = "../../outside"
                item.size = len(content) if not kind else 0
                output.addfile(item, io.BytesIO(content) if not kind else None)
        checksum = hashlib.sha256(filename.read_bytes()).hexdigest()
        return str(filename), checksum

    def test_valid_artifact(self):
        self.assertGreater(guard.validate(*self.archive()), 0)

    def test_checksum_mismatch(self):
        filename, _ = self.archive()
        with self.assertRaises(ValueError):
            guard.validate(filename, "0" * 64)

    def test_unsafe_paths_and_persistent_data(self):
        for name in ["/etc/escape", "agents/backend/../../escape", "agents/backend/a\\b",
                     "agents/backend/.env.production", "agents/backend/uploads/customer.jpg",
                     "agents/backend/logs/runtime.log", "unexpected/file", "agents/backend/a\nb"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                guard.validate(*self.archive([(name, b"fixture", None)]))

    def test_symlink_hardlink_fifo_and_device(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE]:
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                guard.validate(*self.archive([("agents/backend/link", b"", kind)]))

    def test_duplicate_destination(self):
        with self.assertRaises(ValueError):
            guard.validate(*self.archive([("agents/backend/package.json", b"duplicate", None)]))

    def test_missing_guard(self):
        with self.assertRaises(ValueError):
            guard.validate(*self.archive(omit="contact-change.cjs"))

    def test_committed_source_filter_preserves_vendor_assets_but_excludes_runtime(self):
        for name in ["agents/backend/.env", "agents/frontend/dist/index.js", "agents/website/.next/cache", "agents/backend/uploads/customer.jpg", "agents/backend/node_modules/module.js"]:
            self.assertFalse(packager.source_member(name))
        self.assertTrue(packager.source_member("agents/frontend/public/vendor/dist/library.js"))
        self.assertTrue(packager.source_member("agents/backend/src/app.ts"))


if __name__ == "__main__":
    unittest.main()
