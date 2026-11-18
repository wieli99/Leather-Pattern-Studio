import hashlib
import importlib.util
import io
import unittest
from unittest.mock import patch
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('promote', Path(__file__).with_name('promote-desktop.py'))
promote = importlib.util.module_from_spec(spec)
spec.loader.exec_module(promote)


class PromotionTests(unittest.TestCase):
    def test_exact_successful_main_commit_only(self):
        good = dict(id=1, head_sha='expected', event='push', head_branch='main', conclusion='success')
        self.assertEqual(promote.matching_run([good], 'expected'), good)
        for changes in [dict(head_sha='wrong'), dict(event='pull_request'), dict(head_branch='dev'), dict(conclusion='failure')]:
            with self.assertRaises(ValueError):
                promote.matching_run([good | changes], 'expected')

    def archive(self, name='App.exe'):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z:
            z.writestr(name, b'installer')
        data = buffer.getvalue()
        return dict(name='desktop-test', expired=False, digest='sha256:' + hashlib.sha256(data).hexdigest()), data

    def test_digest_expiry_and_identity(self):
        artifact, data = self.archive()
        self.assertEqual(promote.extract_package(artifact, data, 'App.exe'), b'installer')
        for changes in [dict(expired=True), dict(digest='sha256:incorrect')]:
            with self.assertRaises(ValueError):
                promote.extract_package(artifact | changes, data, 'App.exe')
        with self.assertRaises(ValueError):
            promote.extract_package(artifact, data, 'Other-version-arm64.exe')

    def test_archive_paths_never_extracted_and_public_names_normalized(self):
        artifact, data = self.archive('../../Leather Pattern Studio.exe')
        self.assertEqual(promote.extract_package(artifact, data, 'Leather.Pattern.Studio.exe'), b'installer')
        self.assertEqual(len(promote.expected_packages('0.4.0-beta.3')), 6)

    def test_interrupted_draft_upload_resumes_and_published_release_is_immutable(self):
        expected = promote.expected_packages('1.2.3')
        archives = {}
        artifacts = []
        for i, (name, filename) in enumerate(expected.items()):
            artifact, archive = self.archive(filename)
            artifacts.append(artifact | dict(id=i, name=name))
            archives[str(i)] = archive
        run = dict(id=99, head_sha='sha', event='push', head_branch='main', conclusion='success', html_url='run')
        state = dict(draft=True, tag_name='v1.2.3', assets=[])
        interrupted = [True]
        writes = []
        def fake_gh(*args):
            if args[0] == 'api':
                return archives[args[-1].split('/')[-2]]
            self.assertEqual(args[:2], ('release', 'upload'))
            path = Path(args[3])
            if interrupted[0] and len(writes) == 2:
                interrupted[0] = False
                raise RuntimeError('interrupted upload')
            writes.append(path.name)
            state['assets'] = [a for a in state['assets'] if a['name'] != path.name]
            state['assets'].append(dict(name=path.name, digest='sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()))
            return b''
        def fake_pages(path, field):
            return artifacts if field == 'artifacts' else [run]
        def fake_git(args, **kwargs):
            return 'sha' if args[1] == 'rev-parse' else b'{"version":"1.2.3"}'
        with patch('sys.argv', ['promote', 'v1.2.3']), patch.object(promote, 'pages', side_effect=fake_pages), patch.object(promote, 'api', return_value=[state]), patch.object(promote, 'gh', side_effect=fake_gh), patch.object(promote.subprocess, 'check_output', side_effect=fake_git), patch.object(promote.subprocess, 'run'):
            with self.assertRaisesRegex(RuntimeError, 'interrupted'):
                promote.main()
            promote.main()
            self.assertEqual(len(state['assets']), 7)
            state['draft'] = False
            count = len(writes)
            promote.main()
            self.assertEqual(len(writes), count)
            state['assets'][0]['digest'] = 'wrong'
            with self.assertRaisesRegex(ValueError, 'Published release differs'):
                promote.main()
            self.assertEqual(len(writes), count)


if __name__ == '__main__':
    unittest.main()
