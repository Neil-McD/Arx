# Builds the hi-fi mock's pages. Run from anywhere:
#   python3 docs/design/hifi-mock/build.py [out-dir]   (default: /tmp/polynet-hifi-mock)
# Writes out_<Page>.html plus the banner image they use. Compare a page with
# the design lab using scripts/design/match_score.mjs.
import re, base64, os, sys, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "/tmp/polynet-hifi-mock")
os.makedirs(OUT, exist_ok=True)
shutil.copy(os.path.join(HERE, "../../../apps/web/public/design-lab/polynet-earth.webp"), OUT)
os.chdir(HERE)
sys.path.insert(0, HERE)
from lib import icon, MARK, big_map, mini_map
from hostv import host, hostquiet, hostnew, light, hostlight

def svgurl(svg):
    return "url('data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode() + "')"

B_DE = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400"><defs><radialGradient id="a" cx="78%" cy="110%" r="75%">'
        '<stop offset="0" stop-color="#F0A93A"/><stop offset=".45" stop-color="#8A5514"/><stop offset="1" stop-color="#17120B"/></radialGradient></defs>'
        '<rect width="1200" height="400" fill="url(#a)"/><g fill="#FFD27A" opacity=".16"><path d="M520 400 820 0h70L590 400zM700 400 1000 0h40L740 400zM860 400 1160 0h90L950 400z"/></g>'
        '<g fill="none" stroke="#FFE2A8" stroke-opacity=".5" stroke-width="2"><path d="M60 300h260l60-70h200l70-90h180"/><circle cx="850" cy="140" r="7" fill="#FFE2A8"/></g></svg>')
B_KILN = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400"><rect width="1200" height="400" fill="#EFE2CF"/><circle cx="930" cy="110" r="64" fill="#F8F2E7"/>'
          '<ellipse cx="250" cy="420" rx="210" ry="190" fill="#C8643C"/><ellipse cx="520" cy="440" rx="150" ry="150" fill="#DE9468"/>'
          '<ellipse cx="1010" cy="470" rx="260" ry="200" fill="#8E4B30"/><ellipse cx="740" cy="450" rx="120" ry="110" fill="#B9B08F"/>'
          '<path d="M0 330h1200" stroke="#fff" stroke-opacity=".5" stroke-width="2"/></svg>')

COMMS = {
    'pn': dict(name='Polynet', mark=None, banner="url(./polynet-earth.webp)", bpos='72% 38%'),
    'de': dict(name='Distribution Engineer', mark=('DE', '#E8A33D'), banner=svgurl(B_DE), bpos='center',
               time='7:02 am', hello=("Good morning, Maya.", "One thing needs you today."),
               card=("Launch · 3 of 6", "Send your first ten outbound emails",
                     "I drafted openers from your call notes and found forty warm leads who match your offer. They're ready when you are.",
                     ["Approve and send", "Review the drafts", "Talk it over"]),
               rows=[("#wins", "Jon booked his first call", "He shared the opener that did it · 12 reactions"),
                     ("Asked", "Sara wants to know when to follow up", "You tested this last month · your answer would help"),
                     ("Learned", "A day-three follow-up beats day five", "From your test and two pods · saved to Knowledge")],
               event=("Live in 20 minutes", "Friday teardown", "Neil is hosting · 14 going"), notes="186 notes · 2 learned this week"),
    'kc': dict(name='Kiln & Clay', mark=('KC', '#D9764A'), banner=svgurl(B_KILN), bpos='center',
               time='8:15 am', hello=("Good morning, Maya.", "Your glaze tests are out of the kiln."),
               card=("Glaze basics · 3 of 6", "Photograph your glaze tiles",
                     "I'll compare them with sixty firings in the studio's notes and tell you which recipe you're closest to.",
                     ["Add photos", "Remind me tonight", "Talk it over"]),
               rows=[("#wins", "Ines sold out her first market stall", "She shared her price list · 18 reactions"),
                     ("Asked", "Tom needs help centring larger pieces", "You worked this out last month · your answer would help"),
                     ("Learned", "Celadon runs less over white slip", "From eleven firings this month · saved to Knowledge")],
               event=("Starts at 10:00", "Open studio", "Ines is hosting · 9 going"), notes="97 notes · 4 learned this week"),
    'nw': dict(name='Night Writers', mark=('NW', '#E06C8B'), banner="linear-gradient(135deg,#E06C8B,#5A2238)", bare=True,
               time='8:40 pm', hello=("Good evening, Maya.", "Your chapter has two notes from Ana."),
               card=("Draft one · 4 of 9", "Read Ana's notes on chapter four",
                     "She loved the opening and thinks the middle drags. I marked the three paragraphs she means.",
                     ["Open the notes", "Later", "Talk it over"]),
               rows=[("#wins", "Kofi finished his first draft", "Ninety-one thousand words · 24 reactions"),
                     ("Asked", "Mira is looking for a reader", "It's a short story in your genre · she asked for you"),
                     ("Learned", "Twenty-five minute sprints get the most written", "From forty sprints this season · saved to Knowledge")],
               event=("Tonight at 9:00", "Writing sprint", "Kofi is hosting · 12 going"), notes="143 notes · 1 learned this week"),
}

def swap(src, a, b, new):
    i = src.index(a); j = src.index(b, i)
    return src[:i] + new + src[j:]

def hero(d):
    step, title, say, acts = d['card']
    n = int(step.split('·')[1].split('of')[0]); tot = int(step.split('of')[1])
    ticks = ''.join('<i class="%s"></i>' % ('d' if i < n - 1 else 'n' if i == n - 1 else '') for i in range(tot))
    rows = ''.join(
        '<label class="item"><span class="k%s">%s%s</span><span><b>%s</b><span class="s">%s</span></span><span class="go">{i:arrow}</span></label>'
        % (' learn' if k == 'Learned' else '', '{i:spark}' if k == 'Learned' else '', k, t, s) for k, t, s in d['rows'])
    return ('<div class="eyebrow">{i:spark}{cname}, your guide <em>· %s</em></div>\n'
            '        <p class="hello">%s<span>%s</span></p>\n'
            '        <div class="card"><div class="meta"><span>Your next step</span><span class="steps">%s %s</span></div>\n'
            '          <h2>%s</h2><p class="say">%s</p>\n'
            '          <div class="acts"><label class="btn go">%s</label><label class="btn">%s</label><label class="btn txt">%s</label></div></div>\n'
            '        <div class="since"><span class="lab">Since you were last here</span>%s</div>\n        '
            % (d['time'], d['hello'][0], d['hello'][1], step, ticks, title, say, acts[0], acts[1], acts[2], rows))

QUIET = '''<div class="eyebrow">{i:spark}{cname}, your guide <em>· 8:40 pm</em></div>
        <p class="hello">Good evening, Maya.<span>Nothing needs you tonight. It was a quiet, good day.</span></p>
        <div class="since" style="margin-top:44px">
          <span class="lab">While you were away</span>
          <label class="item"><input type="radio" name="v" class="v-wins"><span class="k">#wins</span><span><b>Rashid's first paid member came in</b><span class="s">Through the new door · 9 reactions</span></span><span class="go">{i:arrow}</span></label>
          <label class="item"><span class="k">Friday</span><span><b>The build call is in three days</b><span class="s">Neil is hosting · I'll remind you an hour before</span></span><span class="go">{i:arrow}</span></label>
        </div>
        '''
DAYONE = '''<div class="eyebrow">{i:spark}{cname}, your guide <em>· just now</em></div>
        <p class="hello">Welcome, Maya.<span>I'm the guide here. Three small steps and you'll know your way around.</span></p>
        <div class="card">
          <div class="meta"><span>Start here</span><span class="steps">1 of 3 <i class="n"></i><i></i><i></i></span></div>
          <h2>Say hello in #general</h2>
          <p class="say">Tell people what you're building. I'll introduce you to two members working on the same thing.</p>
          <div class="acts"><label class="btn go">Write my hello</label><label class="btn">Show me around</label></div>
        </div>
        <div class="since">
          <span class="lab">Good places to begin</span>
          <label class="item"><input type="radio" name="v" class="v-wins"><span class="k">#wins</span><span><b>See what's working for others</b><span class="s">Jon passed 100 members this week</span></span><span class="go">{i:arrow}</span></label>
          <label class="item"><input type="radio" name="v" class="v-know"><span class="k learn">{i:spark}Knowledge</span><span><b>The three-line invitation</b><span class="s">The most-read note this month</span></span><span class="go">{i:arrow}</span></label>
          <label class="item"><span class="k">People</span><span><b>Meet Jon and Priya</b><span class="s">Both launched in the last month</span></span><span class="go">{i:arrow}</span></label>
        </div>
        '''

def quiet(s):
    s = swap(s, '<div class="eyebrow">', '<div class="talk">', QUIET).replace('{appstyle}', '--aura:.08;{appstyle}')
    s = s.replace('{i:home}Home<span class="count">1</span>', '{i:home}Home').replace('<span class="live"><i></i>20 min</span>', '<span class="hint">Fri</span>')
    s = s.replace('<label class="row unread n-wins">', '<label class="row n-wins">').replace('{i:hash}wins<span class="dot"></span>', '{i:hash}wins')
    s = s.replace('<span class="livepill"><i></i>Live in 20 minutes</span>', '<span class="lab">Next up</span>').replace('<p>Neil is hosting · 14 going</p>', '<p>Friday, 10:00 am · Neil is hosting</p>')
    return s.replace('<span class="sub" style="white-space:nowrap">Neil, Jon and 4 more</span>', '<span class="sub" style="white-space:nowrap">5 members around</span>')

def dayone(s):
    s = swap(s, '<div class="eyebrow">', '<div class="talk">', DAYONE)
    return s.replace('<span class="chip">What did I miss?</span><span class="chip">Who should I meet?</span><span class="chip">Draft my intro</span>',
                     '<span class="chip">What is this community for?</span><span class="chip">Who should I meet?</span><span class="chip">How do the calls work?</span>')

def render(key, fn=None):
    d = COMMS[key]; s = open('body.html').read()
    if fn: s = fn(s)
    if 'hello' in d:
        s = swap(s, '<div class="eyebrow">', '<div class="talk">', hero(d))
        e = d['event']
        s = s.replace('<span class="livepill"><i></i>Live in 20 minutes</span>', '<span class="livepill"><i></i>%s</span>' % e[0])
        s = s.replace('<h3>Friday build call</h3>', '<h3>%s</h3>' % e[1]).replace('<p>Neil is hosting · 14 going</p>', '<p>%s</p>' % e[2])
        s = s.replace('214 notes · 3 learned this week', d['notes'])
    if d['mark']:
        markel = '<span class="mark" style="background:%s;color:#0B0C0F;border:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.35)">%s</span>' % (d['mark'][1], d['mark'][0])
    else:
        markel = '<span class="mark">' + MARK + '</span>'
    style = '--banner:%s;--bpos:%s' % (d['banner'], d.get('bpos', 'center')) 
    s = s.replace('{markel}', markel).replace('{cname}', d['name']).replace('{bare}', ' bare' if d.get('bare') else '').replace('{appstyle}', style).replace('{appclass}', '')
    s = s.replace('{mark}', MARK).replace('{map}', big_map())
    while '{mini}' in s: s = s.replace('{mini}', mini_map(), 1)
    return re.sub(r'\{i:(\w+)(:\w+)?\}', icon, s)

css = open('style.css').read()
FONTS = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;550;600;700&family=Newsreader:opsz,wght@6..72,300..500&display=swap'
DC = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>@TITLE@</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="@FONTS@" rel="stylesheet">
<style>
@CSS@
</style>
</helmet>
@BODY@
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
'''


def emit(name, title, body):
    open(os.path.join(OUT, 'out_' + name + '.html'), 'w').write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>%s</title><link href="%s" rel="stylesheet"><style>%s</style></head><body>%s</body></html>' % (title, FONTS, css, body))
    if os.path.isdir('../project'):  # the design tool's copy, when present
        open('../project/' + name + '.dc.html', 'w').write(DC.replace('@TITLE@', title).replace('@FONTS@', FONTS.replace('&', '&amp;')).replace('@CSS@', css).replace('@BODY@', body))

emit('DefaultApp', 'Polynet default: the app', render('pn'))
emit('DefaultDE', 'Polynet default: Distribution Engineer', render('de'))
emit('DefaultKiln', 'Polynet default: Kiln and Clay', render('kc'))
emit('DefaultBare', 'Polynet default: no banner', render('nw'))
emit('DefaultQuiet', 'Polynet default: a quiet day', render('pn', quiet))
emit('DefaultDayOne', 'Polynet default: day one', render('pn', dayone))
emit('HostApp', 'Polynet default: the host view', render('pn', host))
emit('HostQuiet', 'Polynet default: host, a quiet day', render('pn', hostquiet))
emit('HostNew', 'Polynet default: host, a new community', render('nw', hostnew))
emit('LightApp', 'Polynet default: light, member', render('pn', light))
emit('LightHost', 'Polynet default: light, host', render('pn', hostlight))
emit('LightDE', 'Polynet default: light, Distribution Engineer', render('de', light))
emit('LightKiln', 'Polynet default: light, Kiln and Clay', render('kc', light))
emit('LightBare', 'Polynet default: light, no banner', render('nw', light))
if os.path.exists('foundations.html'):  # the foundations board is not in the repo
    fd = open('foundations.html').read()
    for k in ('de', 'kc'): fd = fd.replace('{b_%s}' % k, COMMS[k]['banner'])
    emit('DefaultFoundations', 'Polynet default: foundations', fd)
print('built into', OUT)
