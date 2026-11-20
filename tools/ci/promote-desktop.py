#!/usr/bin/env python3
"""Promote exact-commit main artifacts; never compile on a release tag."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
import time
import zipfile

REPO = os.environ.get('GITHUB_REPOSITORY', 'wieli99/Leather-Pattern-Studio')


def gh(*args):
    for attempt in range(3):
        result = subprocess.run(['gh', *args], capture_output=True)
        if result.returncode == 0:
            return result.stdout
        error = result.stderr.decode(errors='replace')
        if attempt == 2 or not any(f'HTTP {s}' in error for s in (429, 500, 502, 503, 504)):
            raise RuntimeError('GitHub operation failed: ' + error.splitlines()[0][:180])
        time.sleep(2 ** attempt)


def api(path):
    return json.loads(gh('api', f'repos/{REPO}/{path}'))


def pages(path, field):
    page = 1
    while True:
        data = api(f'{path}&per_page=100&page={page}')[field]
        yield from data
        if len(data) < 100:
            return
        page += 1


def matching_run(runs, sha):
    candidates = [r for r in runs if r['head_sha'] == sha and r['event'] == 'push'
                  and r['head_branch'] == 'main' and r['conclusion'] == 'success']
    if not candidates:
        raise ValueError('No successful main push build for the exact tag commit')
    return max(candidates, key=lambda r: r['id'])


def expected_packages(version):
    return {
        'desktop-x86_64-unknown-linux-gnu': 'Leather-Pattern-Studio-x86_64.flatpak',
        'desktop-aarch64-unknown-linux-gnu': 'Leather-Pattern-Studio-aarch64.flatpak',
        'desktop-x86_64-pc-windows-msvc': f'Leather.Pattern.Studio_{version}_x64-setup.exe',
        'desktop-aarch64-pc-windows-msvc': f'Leather.Pattern.Studio_{version}_arm64-setup.exe',
        'desktop-x86_64-apple-darwin': f'Leather.Pattern.Studio_{version}_x64.dmg',
        'desktop-aarch64-apple-darwin': f'Leather.Pattern.Studio_{version}_aarch64.dmg',
    }


def extract_package(artifact, archive, expected):
    if artifact['expired']:
        raise ValueError('Expired artifact: ' + artifact['name'])
    if artifact.get('digest') != 'sha256:' + hashlib.sha256(archive).hexdigest():
        raise ValueError('Artifact digest mismatch: ' + artifact['name'])
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        files = [n for n in z.namelist() if not n.endswith('/')]
        if len(files) != 1 or PurePosixPath(files[0]).name.replace(' ', '.') != expected:
            raise ValueError('Unexpected installer name, architecture, or version: ' + artifact['name'])
        data = z.read(files[0])
        if not data:
            raise ValueError('Empty installer')
        return data


def find_release(tag):
    page = 1
    while True:
        batch = api(f'releases?per_page=100&page={page}')
        found = next((r for r in batch if r['tag_name'] == tag), None)
        if found or len(batch) < 100:
            return found
        page += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tag')
    args = parser.parse_args()
    sha = subprocess.check_output(['git', 'rev-parse', args.tag + '^{commit}'], text=True).strip()
    subprocess.run(['git', 'merge-base', '--is-ancestor', sha, 'origin/main'], check=True)
    version = json.loads(subprocess.check_output(['git', 'show', sha + ':package.json']))['version']
    if args.tag != 'v' + version:
        raise ValueError('Tag and application version differ')
    matching_run(pages('actions/workflows/ci.yml/runs?branch=main&event=push&status=success', 'workflow_runs'), sha)
    run = matching_run(pages('actions/workflows/desktop.yml/runs?branch=main&event=push&status=success', 'workflow_runs'), sha)
    expected = expected_packages(version)
    artifacts = list(pages(f"actions/runs/{run['id']}/artifacts?", 'artifacts'))
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for name, filename in expected.items():
            found = [a for a in artifacts if a['name'] == name]
            if len(found) != 1 or found[0]['expired']:
                raise ValueError('Missing, duplicate or expired artifact: ' + name)
            artifact = found[0]
            archive = gh('api', '--allow-escape-sequences', f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip")
            (root / filename).write_bytes(extract_package(artifact, archive, filename))
        sums = ''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in sorted(root.iterdir()))
        (root / 'SHA256SUMS').write_text(sums)
        # A missing release is normal; other API errors must not masquerade as absence.
        existing = find_release(args.tag)
        if existing and not existing['draft']:
            assets = {a['name']: a.get('digest') for a in existing['assets']}
            if assets != {p.name: 'sha256:' + hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir()}:
                raise ValueError('Published release differs; refusing to overwrite it')
            print('Published release already matches verified artifacts')
            return
        if not existing:
            flags = ['--prerelease'] if '-' in version else []
            gh('release', 'create', args.tag, '--repo', REPO, '--draft', '--verify-tag', '--title', version,
               '--generate-notes', '--notes', f"Packages promoted from validated main run {run['html_url']} (commit {sha}).", *flags)
        for path in sorted(root.iterdir()):
            gh('release', 'upload', args.tag, str(path), '--repo', REPO, '--clobber')
        release = find_release(args.tag)
        if release is None:
            raise ValueError('Draft disappeared after upload')
        assets = {a['name']: a.get('digest') for a in release['assets']}
        wanted = {p.name: 'sha256:' + hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir()}
        if assets != wanted:
            raise ValueError('Uploaded release assets do not match verified packages')
        print(f"Verified draft {args.tag}: six installers and SHA256SUMS from main run {run['id']}")


if __name__ == '__main__':
    main()
