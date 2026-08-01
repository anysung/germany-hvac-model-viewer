# Bounded ZUM public-list trial fetch (owner-directed market data acquisition).
# Read-only GET/POST of the public search UI; polite (2 s delay, honest UA);
# curl transport (system trust store handles the host's TLS chain); no attachments.
import re, subprocess, sys, time

BASE = 'https://lista-zum.ios.edu.pl/bepub/ben001.aspx'
UA = 'HeatPumpDB-market-research/1.0 (read-only; contact: owner of heatpumpdb.de)'
JAR = '/tmp/zum-jar.txt'


def get(url):
    return subprocess.run(['curl', '-sS', '--max-time', '60', '-A', UA,
                           '-c', JAR, '-b', JAR, url],
                          capture_output=True, text=True, check=True).stdout


def post(url, fields):
    args = ['curl', '-sS', '--max-time', '120', '-A', UA, '-c', JAR, '-b', JAR, url]
    for k, v in fields.items():
        args += ['--data-urlencode', f'{k}={v}']
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout


def inputs(html):
    out = {}
    for m in re.finditer(r'<input\b[^>]*>', html):
        tag = m.group(0)
        name = re.search(r'name="([^"]+)"', tag)
        if not name:
            continue
        typ = re.search(r'type="([^"]+)"', tag)
        val = re.search(r'value="([^"]*)"', tag)
        out[name.group(1)] = (typ.group(1) if typ else 'text', val.group(1) if val else '')
    return out


def main():
    cat, outfile = sys.argv[1], sys.argv[2]
    h = get(BASE)
    ins = inputs(h)
    fields = {name: val for name, (typ, val) in ins.items() if typ == 'hidden'}
    for name in list(fields):
        if name.startswith('hf_24_'):
            fields[name] = '1' if name == f'hf_24_{cat}' else '0'
    fields['__EVENTTARGET'] = 'ctl00$MainContent$btnSearch'
    fields['__EVENTARGUMENT'] = ''
    time.sleep(2)
    r = post(BASE, fields)
    open(outfile, 'w').write(r)
    print('response bytes:', len(r))
    for pat in ['GridView', 'gvw', r'Page\$', 'class="tabelka', '<table', '<tr']:
        print(pat, '→', len(re.findall(pat, r)))


if __name__ == '__main__':
    main()
