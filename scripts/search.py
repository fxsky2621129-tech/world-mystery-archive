#!/usr/bin/env python3
"""Manual GitHub Actions search. Uses documented public APIs only.

Secrets are read from environment; never written to JSON or site files.
No scheduled or automated background fetching is configured.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'site' / 'data' / 'catalog.json'
DICTIONARY = ROOT / 'site' / 'data' / 'dictionary.json'
USER_AGENT = 'WorldMysteryArchive/1.0 (personal discovery tool)'
ALLOWED_SITES = {'peertube', 'niconico', 'vimeo'}


def get_json(url, headers=None):
    request = Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json', **(headers or {})})
    with urlopen(request, timeout=18) as response:
        return json.load(response)


def safe_url(value):
    if not isinstance(value, str):
        return None
    if len(value) > 2048 or re.search(r'[\x00-\x20\\]', value):
        return None
    try:
        parsed = urlparse(value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            return None
        parsed.port
    except ValueError:
        return None
    return value


def response_items(data):
    if not isinstance(data, dict) or not isinstance(data.get('data'), list):
        raise ValueError('APIの応答形式が不正です')
    return [item for item in data['data'] if isinstance(item, dict)]


def clamp_title(value):
    return re.sub(r'[\x00-\x1f]', ' ', str(value or '無題の動画'))[:180]


def valid_record(site, url, title, thumbnail=None, views=None, published=None, author=None):
    video_url = safe_url(url)
    if not video_url:
        return None
    thumb_url = safe_url(thumbnail)
    try:
        count = int(views) if views is not None else None
        if count is not None and count < 0:
            count = None
    except (TypeError, ValueError):
        count = None
    return {
        'id': f'{site}:{video_url}', 'site': site, 'url': video_url,
        'title': clamp_title(title), 'thumbnail': thumb_url,
        'views': count, 'published': str(published) if published else None,
        'author': str(author or '')[:90]
    }


def expand_terms(keyword, mode='multi', extra=''):
    keyword = keyword.strip()
    if not keyword:
        return []
    terms = [keyword]
    if mode == 'multi':
        groups = json.loads(DICTIONARY.read_text(encoding='utf-8'))['groups']
        lowered = keyword.casefold()
        for group in groups:
            if any(trigger.casefold() in lowered for trigger in group['triggers']):
                terms += group['terms'][:5]
                break
    if extra:
        terms += [x.strip() for x in re.split(r'[,，\n]', extra) if x.strip()]
    return list(dict.fromkeys(t for t in terms if len(t) <= 120))[:8]


def search_peertube(keyword, safe=True, limit=20):
    params = urlencode({'search': keyword, 'count': min(limit, 30), 'sort': '-match', **({'nsfw': 'false'} if safe else {})})
    data = get_json('https://sepiasearch.org/api/v1/search/videos?' + params)
    records = []
    for item in response_items(data):
        url = item.get('url')
        host = (item.get('channel') or {}).get('host') or (item.get('account') or {}).get('host')
        if not url and host and item.get('uuid') and re.fullmatch(r'[\w.-]+', host):
            url = f'https://{host}/w/{item["uuid"]}'
        thumbnail = item.get('thumbnailUrl') or item.get('thumbnailPath')
        if isinstance(thumbnail, str) and thumbnail.startswith('/'):
            thumbnail = urljoin('https://sepiasearch.org/', thumbnail)
        record = valid_record('peertube', url, item.get('name'), thumbnail, item.get('views'),
                              item.get('publishedAt') or item.get('createdAt'),
                              (item.get('channel') or {}).get('displayName') or (item.get('account') or {}).get('displayName'))
        if record:
            records.append(record)
    return records


def search_niconico(keyword, limit=30):
    params = urlencode({
        'q': keyword, 'targets': 'title,description,tags',
        'fields': 'contentId,title,thumbnailUrl,viewCounter,startTime',
        '_sort': '-viewCounter', '_limit': min(limit, 50),
        '_context': 'WorldMysteryArchive'
    })
    data = get_json('https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?' + params)
    records = []
    for item in response_items(data):
        vid = str(item.get('contentId') or '')
        if not re.fullmatch(r'[a-zA-Z]{1,5}\d{1,20}', vid):
            continue
        record = valid_record('niconico', f'https://www.nicovideo.jp/watch/{vid}', item.get('title'),
                              item.get('thumbnailUrl'), item.get('viewCounter'), item.get('startTime'))
        if record:
            records.append(record)
    return records


def search_vimeo(keyword, token, limit=20):
    params = urlencode({'query': keyword, 'per_page': min(limit, 30), 'sort': 'relevant', 'direction': 'desc'})
    data = get_json('https://api.vimeo.com/videos?' + params,
                    headers={'Authorization': 'Bearer ' + token})
    records = []
    for item in response_items(data):
        thumb_sizes = (item.get('pictures') or {}).get('sizes') or []
        thumbnail = thumb_sizes[-1].get('link') if thumb_sizes else None
        record = valid_record('vimeo', item.get('link'), item.get('name'), thumbnail,
                              (item.get('stats') or {}).get('plays'), item.get('created_time'),
                              (item.get('user') or {}).get('name'))
        if record:
            records.append(record)
    return records


def read_existing():
    try:
        return json.loads(CATALOG.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {'videos': []}


def run(query, mode='multi', extra='', sites='peertube,niconico,vimeo', safe=True):
    query = query.strip()
    if not query or len(query) > 120:
        raise ValueError('検索語は1〜120文字にしてください')
    chosen = [site.strip().lower() for site in sites.split(',') if site.strip().lower() in ALLOWED_SITES]
    chosen = list(dict.fromkeys(chosen))
    if not chosen:
        raise ValueError('検索するサイトが選択されていません')
    terms = expand_terms(query, mode, extra)
    videos, summaries = [], []
    succeeded = 0
    for site in chosen:
        searches = [query] if site == 'niconico' else terms
        token = os.environ.get('VIMEO_ACCESS_TOKEN', '').strip()
        if site == 'vimeo' and not token:
            summaries.append({'site': site, 'status': 'skipped', 'count': 0, 'reason': 'VIMEO_ACCESS_TOKEN未設定'})
            continue
        count = 0
        errors = []
        for term in searches:
            try:
                if site == 'peertube':
                    items = search_peertube(term, safe=safe)
                elif site == 'niconico':
                    items = search_niconico(term)
                else:
                    items = search_vimeo(term, token)
                succeeded += 1
                videos.extend(items)
                count += len(items)
            except (HTTPError, URLError, TimeoutError, ValueError, KeyError, TypeError, AttributeError, OSError) as exc:
                errors.append(f'{type(exc).__name__}: {getattr(exc, "code", str(exc))}'[:120])
        summaries.append({'site': site, 'status': 'ok' if not errors else 'partial' if count or len(errors) < len(searches) else 'error',
                          'count': count, 'errors': errors[:3]})
    if succeeded == 0:
        raise RuntimeError('全サイトのAPI取得に失敗しました。前回の検索結果は保持されます。')
    deduped = list({item['url']: item for item in videos}.values())[:300]
    payload = {'updated_at': datetime.now(timezone.utc).isoformat(), 'query': query, 'language_mode': mode,
               'queries': terms, 'sources': summaries, 'videos': deduped}
    CATALOG.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'検索完了: {len(deduped)}件 / 取得成功 {succeeded}リクエスト / 対象 {", ".join(chosen)}')
    for entry in summaries:
        print(f'  {entry["site"]}: {entry["status"]} / {entry["count"]}件')
    return payload


if __name__ == '__main__':
    search_query = os.environ.get('SEARCH_QUERY', '心霊映像')
    try:
        run(search_query,
            mode=os.environ.get('SEARCH_MODE', 'multi'),
            extra=os.environ.get('SEARCH_EXTRA', ''),
            sites=os.environ.get('SEARCH_SITES', 'peertube,niconico,vimeo'),
            safe=os.environ.get('SEARCH_SAFE', 'true').lower() != 'false')
    except (RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
