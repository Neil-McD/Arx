def between(src, a, b, new):
    i = src.index(a) + len(a); j = src.index(b, i)
    return src[:i] + new + src[j:]

HQ = '''<div class="eyebrow">{i:spark}{cname}, your guide <em>· 8:40 pm</em></div>
        <p class="hello">Good evening, Neil.<span>Nothing needs you. The community looked after itself today.</span></p>
        <div class="since" style="margin-top:44px">
          <span class="lab">Across the community</span>
          <label class="item"><span class="k">Joined</span><span><b>One new member, Mira</b><span class="s">She said hello in #general · four people replied</span></span><span class="go">{i:arrow}</span></label>
          <label class="item"><span class="k learn">{i:spark}Answered</span><span><b>I answered six questions from Knowledge</b><span class="s">All six were marked helpful</span></span><span class="go">{i:arrow}</span></label>
          <label class="item"><span class="k">Friday</span><span><b>Fourteen people are coming to the build call</b><span class="s">Jon is bringing his invitation · I'll draft the agenda tomorrow</span></span><span class="go">{i:arrow}</span></label>
        </div>'''

HN = '''<div class="eyebrow">{i:spark}{cname}, your guide <em>· just now</em></div>
        <p class="hello">Welcome, Neil.<span>Your community is ready. Three steps and you can invite your first members.</span></p>
        <div class="card">
          <div class="meta"><span>Start here</span><span class="steps">1 of 3 <i class="n"></i><i></i><i></i></span></div>
          <h2>Add a banner and a logo</h2>
          <p class="say">Any image works, and it takes a minute. It's the first thing your members will see.</p>
          <div class="acts"><span class="btn go">Add them</span><span class="btn">Skip for now</span></div>
        </div>
        <div class="since">
          <span class="lab">Then</span>
          <label class="item"><span class="k">Step 2</span><span><b>Write your door</b><span class="s">I'll draft it from five short questions</span></span><span class="go">{i:arrow}</span></label>
          <label class="item"><span class="k">Step 3</span><span><b>Invite your first ten members</b><span class="s">I'll help you choose who, and write the invitation</span></span><span class="go">{i:arrow}</span></label>
        </div>'''

FIG_NEW = '''<div class="sec">
      <span class="lab">Today</span>
      <ul class="tl"><li><b>Your community is open</b><span>Just you, for now · invite your first ten</span></li></ul>
    </div>'''

def host(s):
    return s.replace('{appclass}', ' host{appclass}')

def light(s):
    return s.replace('{appclass}', ' light{appclass}')

def hostlight(s):
    return light(host(s))

def hostquiet(s):
    s = between(host(s), '<!--HH-->', '<!--/HH-->', HQ).replace('{appstyle}', '--aura:.08;{appstyle}')
    s = s.replace('{i:home}Home<span class="count">1</span>', '{i:home}Home')
    return s.replace('<span class="livepill"><i></i>Live in 20 minutes</span>\n      <h3>Friday build call</h3>\n      <p>You\'re hosting · 14 going</p>',
                     '<span class="lab">Next up</span>\n      <h3>Friday build call</h3>\n      <p>Friday, 10:00 am · you\'re hosting</p>')

def hostnew(s):
    s = between(host(s), '<!--HH-->', '<!--/HH-->', HN)
    s = between(s, '<!--HR-->', '<!--/HR-->', FIG_NEW)
    s = s.replace('<span class="chip">How was this week?</span><span class="chip">Who is at risk of leaving?</span><span class="chip">Draft Friday\'s agenda</span>',
                  '<span class="chip">What should my door say?</span><span class="chip">How do I price it?</span><span class="chip">Who should I invite first?</span>')
    i = s.index('<!--/HR-->'); j = s.index('</aside>', i)
    s = s[:i] + '<!--/HR-->\n    <div class="sep"></div>\n    <div class="sec"><span class="lab">Your first call</span><p>Nothing is scheduled yet. A weekly call is the fastest way to bring people back.</p><div style="display:flex;margin-top:6px"><span class="btn" style="height:32px;font-size:13px">Plan a call</span></div></div>\n  ' + s[j:]
    s = s.replace('<span class="live"><i></i>20 min</span>', '').replace('<label class="row unread n-wins">', '<label class="row n-wins">').replace('{i:hash}wins<span class="dot"></span>', '{i:hash}wins').replace('{i:inbox}Inbox<span class="hint">4</span>', '{i:inbox}Inbox')
    return s.replace('<span class="hint">214</span>', '<span class="hint">1</span>').replace('<span class="hint">3 new</span>', '').replace('{i:home}Home<span class="count">1</span>', '{i:home}Home')
