import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from verify_upload_restore import verify


class VerifyUploads(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'restored/uploads').mkdir(parents=True)
        (self.root / 'restored/uploads/example.txt').write_bytes(b'synthetic')

    def archive(self, name='uploads/example.txt', value=b'synthetic', kind=None, link=''):
        p = self.root / 'uploads.tgz'
        with tarfile.open(p, 'w:gz') as target:
            member = tarfile.TarInfo(name)
            member.uid = member.gid = 0  # Original owner is retained in the archive.
            if kind is None:
                member.size = len(value)
                target.addfile(member, io.BytesIO(value))
            else:
                member.type, member.linkname = kind, link
                target.addfile(member)
        return p

    def test_verifies_content_regardless_of_extraction_owner(self):
        self.assertEqual(verify(self.archive(), self.root / 'restored')['files'], 1)

    def test_changed_contents_fail_even_when_size_matches(self):
        with self.assertRaises(ValueError):
            verify(self.archive(value=b'different'), self.root / 'restored')

    def test_size_mismatch_fails(self):
        with self.assertRaises(ValueError):
            verify(self.archive(value=b'longer synthetic content'), self.root / 'restored')

    def test_missing_file_fails(self):
        with self.assertRaises(FileNotFoundError):
            verify(self.archive(name='uploads/missing'), self.root / 'restored')

    def test_parent_traversal_fails(self):
        with self.assertRaises(ValueError):
            verify(self.archive(name='uploads/../outside'), self.root / 'restored')

    def test_absolute_path_fails(self):
        with self.assertRaises(ValueError):
            verify(self.archive(name='/outside'), self.root / 'restored')

    def test_escaping_symlink_fails(self):
        (self.root / 'outside').write_bytes(b'synthetic')
        (self.root / 'restored/uploads/link').symlink_to('../../outside')
        with self.assertRaises(ValueError):
            verify(self.archive(name='uploads/link', kind=tarfile.SYMTYPE, link='../../outside'), self.root / 'restored')

    def test_safe_symlink_is_verified(self):
        (self.root / 'restored/uploads/link').symlink_to('example.txt')
        self.assertEqual(verify(self.archive(name='uploads/link', kind=tarfile.SYMTYPE, link='example.txt'), self.root / 'restored')['files'], 0)

    def test_hard_link_reuses_verified_archive_digest(self):
        archive = self.archive()
        os.link(self.root / 'restored/uploads/example.txt', self.root / 'restored/uploads/copy')
        with tarfile.open(archive, 'w:gz') as target:
            first = tarfile.TarInfo('uploads/example.txt')
            first.size = 9
            target.addfile(first, io.BytesIO(b'synthetic'))
            second = tarfile.TarInfo('uploads/copy')
            second.type, second.linkname = tarfile.LNKTYPE, 'uploads/example.txt'
            target.addfile(second)
        self.assertEqual(verify(archive, self.root / 'restored')['files'], 2)


if __name__ == '__main__':
    unittest.main()
