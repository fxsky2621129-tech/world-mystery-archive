import json
import unittest
from unittest.mock import patch
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import search


class SearchTests(unittest.TestCase):
    def test_expansion(self):
        terms = search.expand_terms('日本の幽霊が映った', 'multi')
        self.assertEqual(terms[0], '日本の幽霊が映った')
        self.assertIn('ghost caught on camera', terms)
        self.assertIn('귀신 영상', terms)

    def test_unknown_word_not_falsely_translated(self):
        self.assertEqual(search.expand_terms('全く新しい単語xyz', 'multi'), ['全く新しい単語xyz'])

    def test_japanese_only(self):
        self.assertEqual(search.expand_terms('UFO', 'ja'), ['UFO'])

    def test_safe_link(self):
        self.assertIsNone(search.safe_url('javascript:alert(1)'))
        self.assertIsNone(search.safe_url('file:///tmp/private'))
        self.assertEqual(search.safe_url('https://example.org/watch/1'), 'https://example.org/watch/1')

    def test_niconico_mapping(self):
        mocked = {'data': [{'contentId': 'sm123456', 'title': '心霊映像', 'viewCounter': 120, 'thumbnailUrl': 'https://nicovideo.jp/img.jpg', 'startTime': '2025-01-02T00:00:00Z'},
                           {'contentId': '../bad', 'title': 'bad'}]}
        with patch.object(search, 'get_json', return_value=mocked):
            videos = search.search_niconico('心霊映像')
        self.assertEqual(len(videos), 1)
        self.assertTrue(videos[0]['url'].endswith('sm123456'))
        self.assertEqual(videos[0]['views'], 120)

    def test_peertube_mapping(self):
        mocked = {'data': [{'url':'https://video.example.org/w/xyz','name':'ghost','views':55,'thumbnailUrl':'https://video.example.org/t.jpg','channel':{'displayName':'author'}}]}
        with patch.object(search, 'get_json', return_value=mocked):
            videos = search.search_peertube('ghost')
        self.assertEqual(videos[0]['site'], 'peertube')
        self.assertEqual(videos[0]['author'], 'author')

    def test_vimeo_mapping(self):
        mocked = {'data':[{'link':'https://vimeo.com/12345','name':'The ghost','pictures':{'sizes':[{'link':'https://i.vimeocdn.com/1.jpg'}]},'stats':{'plays':11},'user':{'name':'somebody'}}]}
        with patch.object(search, 'get_json', return_value=mocked):
            videos=search.search_vimeo('ghost', 'secret-token')
        self.assertEqual(videos[0]['site'], 'vimeo')
        self.assertEqual(videos[0]['views'], 11)

    def test_all_failed_does_not_replace_existing_catalog(self):
        original = search.CATALOG.read_bytes()
        with patch.object(search, 'search_peertube', side_effect=OSError('failure')):
            with self.assertRaises(RuntimeError):
                search.run('幽霊', mode='ja', sites='peertube')
        self.assertEqual(search.CATALOG.read_bytes(), original)

    def test_partial_success(self):
        old = search.CATALOG
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as d:
            search.CATALOG = Path(d) / 'catalog.json'
            try:
                record = search.valid_record('niconico','https://www.nicovideo.jp/watch/sm22','映像',views=123)
                with patch.object(search,'search_peertube',side_effect=OSError('network error')):
                    with patch.object(search,'search_niconico',return_value=[record]):
                        output = search.run('幽霊',mode='ja',sites='peertube,niconico')
                self.assertEqual(len(output['videos']), 1)
                self.assertEqual(output['sources'][0]['status'], 'error')
                self.assertEqual(output['sources'][1]['status'], 'ok')
                self.assertEqual(json.loads(search.CATALOG.read_text(encoding='utf-8'))['query'],'幽霊')
            finally:
                search.CATALOG = old

    def test_malformed_urls(self):
        for url in ['https://[bad', 'https://host:bad/x', 'https://host/\npath', 'https://host/' + 'x'*2048]:
            self.assertIsNone(search.safe_url(url))

    def test_malformed_response_does_not_erase_catalog(self):
        original = search.CATALOG.read_bytes()
        with patch.object(search, 'get_json', return_value={'error': 'unavailable'}):
            with self.assertRaises(RuntimeError):
                search.run('ghost', mode='ja', sites='peertube')
        self.assertEqual(search.CATALOG.read_bytes(), original)

    def test_extra_terms_are_requested_and_case_distinct_urls_survive(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as d, patch.object(search, 'CATALOG', Path(d)/'catalog.json'):
            records = [search.valid_record('peertube', 'https://example.org/'+x, x) for x in ['Abc', 'abc']]
            with patch.object(search, 'search_peertube', return_value=records) as api:
                output = search.run('幽霊', extra='extra-one,extra-two', sites='peertube')
            self.assertEqual(len(output['videos']), 2)
            self.assertEqual(api.call_count, 8)
            self.assertIn('extra-two', [call.args[0] for call in api.call_args_list])

    def test_safe_off_does_not_request_only_sensitive_videos(self):
        from urllib.parse import urlparse, parse_qs
        with patch.object(search, 'get_json', return_value={'data': []}) as api:
            search.search_peertube('ghost', safe=False)
        self.assertNotEqual(parse_qs(urlparse(api.call_args.args[0]).query).get('nsfw'), ['true'])

if __name__=='__main__':
    unittest.main()
