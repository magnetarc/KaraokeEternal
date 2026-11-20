"""Read the portable image identity from a Docker export, verifying config bytes."""
import argparse
import hashlib
import json
import tarfile

def image_config_id(archive, architecture=None):
    with tarfile.open(archive, 'r:*') as image:
        manifest = json.load(image.extractfile('manifest.json'))
        assert len(manifest) == 1, 'Expected one runnable image'
        assert manifest[0]['RepoTags'] == ['karaoke-modern:local'], 'Unexpected image tag'
        path = manifest[0]['Config']
        config = image.extractfile(path).read()
        digest = hashlib.sha256(config).hexdigest()
        assert path in (digest + '.json', 'blobs/sha256/' + digest), 'Config content digest mismatch'
        parsed = json.loads(config)
        assert parsed['os'] == 'linux'
        if architecture:
            assert parsed['architecture'] == architecture, 'Unexpected image architecture'
        return 'sha256:' + digest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    parser.add_argument('--arch', choices=['amd64', 'arm64'])
    args = parser.parse_args()
    print(image_config_id(args.archive, args.arch))
