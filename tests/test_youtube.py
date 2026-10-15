import json
import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.error import URLError
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import search

class YouTubeTests(unittest.TestCase):
    def test_video_mapping_and_request(self):
        data = {'items': [{'id': {'videoId': 'AbC123xyz_-'}, 'snippet': {
            'title': 'Cats &amp; Dogs', 'channelTitle': 'Animals',
            'publishedAt': '2026-01-01T00:00:00Z',
            'thumbnails': {'medium': {'url': 'https://i.ytimg.com/test.jpg'}}}},
            {'id': {'channelId': 'ignored'}}]}
        with patch.object(search, 'get_json', return_value=data) as api:
            videos = search.search_youtube('animals', 'test-key')
        self.assertEqual(len(videos), 1)
        self.assertEqual(videos[0]['title'], 'Cats & Dogs')
        self.assertEqual(videos[0]['site'], 'youtube')
        self.assertEqual(videos[0]['author'], 'Animals')
        self.assertIsNone(videos[0]['views'])
        params = parse_qs(urlparse(api.call_args.args[0]).query)
        self.assertEqual(params['type'], ['video'])
        self.assertEqual(params['safeSearch'], ['strict'])

    def test_missing_key_skips_youtube_without_api_call(self):
        with TemporaryDirectory() as d, patch.object(search, 'CATALOG', Path(d)/'catalog.json'):
            with patch.dict(os.environ, {'YOUTUBE_API_KEY': ''}), patch.object(search, 'search_youtube') as yt, patch.object(search, 'search_niconico', return_value=[]):
                output = search.run('cats', sites='youtube,niconico')
            yt.assert_not_called()
            self.assertEqual(output['sources'][0]['status'], 'skipped')

    def test_key_is_not_written_in_error_catalog(self):
        with TemporaryDirectory() as d, patch.object(search, 'CATALOG', Path(d)/'catalog.json'):
            with patch.dict(os.environ, {'YOUTUBE_API_KEY': 'secret-test-key'}), patch.object(search, 'search_youtube', side_effect=URLError('url?key=secret-test-key')), patch.object(search, 'search_niconico', return_value=[]):
                output = search.run('cats', sites='youtube,niconico')
            self.assertNotIn('secret-test-key', json.dumps(output))

    def test_youtube_uses_one_request_per_update(self):
        with TemporaryDirectory() as d, patch.object(search, 'CATALOG', Path(d)/'catalog.json'):
            with patch.dict(os.environ, {'YOUTUBE_API_KEY': 'test-key'}), patch.object(search, 'search_youtube', return_value=[]) as yt:
                search.run('幽霊', sites='youtube')
            self.assertEqual(yt.call_count, 1)
