import re, random, math, json
I = {
 'home':'<path d="M3 10.5 12 3l9 7.500V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 'inbox':'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.500 5.100 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.500-6.900A2 2 0 0 0 16.800 4H7.200a2 2 0 0 0-1.700 1.100z"/>',
 'hash':'<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
 'lock':'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
 'stars':'<circle cx="6" cy="7" r="1.600"/><circle cx="17" cy="5" r="1.600"/><circle cx="12" cy="13" r="2"/><circle cx="5" cy="18" r="1.600"/><circle cx="19" cy="17" r="1.600"/><path d="M7.300 8.100 10.500 11.600M15.800 6.200 13.200 11.300M10.300 14.200 6.400 17.200M13.800 14 17.600 16.300"/>',
 'cal':'<rect x="3" y="4.500" width="18" height="16.500" rx="2"/><path d="M16 2.500v4M8 2.500v4M3 10h18"/>',
 'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.870M16 3.130a4 4 0 0 1 0 7.750"/>',
 'search':'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.600-3.600"/>',
 'spark':'<path d="M12 2.500 14.100 9.400 21 11.500l-6.900 2.100L12 20.500l-2.100-6.900L3 11.500l6.900-2.100z"/>',
 'updown':'<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
 'up':'<path d="M12 19V5M5.500 11.500 12 5l6.500 6.500"/>',
 'arrow':'<path d="M5 12h14M13 6l6 6-6 6"/>',
 'mic':'<rect x="9" y="2.500" width="6" height="11.500" rx="3"/><path d="M5 10.500v.5a7 7 0 0 0 14 0v-.500M12 18v3.500"/>',
 'plus':'<path d="M12 5v14M5 12h14"/>',
 'smile':'<circle cx="12" cy="12" r="9"/><path d="M8.500 14.500s1.300 1.500 3.500 1.500 3.500-1.500 3.500-1.500M9 9.500h.010M15 9.500h.010"/>',
 'reply':'<path d="M9 17 4 12l5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v2"/>',
 'more':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 'check':'<path d="M5 12.500 10 17.500 19 7"/>',
 'close':'<path d="M6 6l12 12M18 6 6 18"/>',
 'sliders':'<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
 'trash':'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
 'eye':'<path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2M12 19.500v2M2.500 12h2M19.500 12h2M5.300 5.300l1.400 1.400M17.300 17.300l1.400 1.400M5.300 18.700l1.400-1.400M17.300 6.700l1.400-1.400"/>',
 'moon':'<path d="M20 14.500A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"/>',
 'play':'<path d="M7 4.500v15l12-7.500z"/>',
 'book':'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13v2H6"/>',
 'pin':'<path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z"/>',
}
def icon(m):
    name=m.group(1); extra=m.group(2) or ''
    cls='ic'+(' '+extra[1:] if extra else '')
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>'
MARK='<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="1.300" stroke-linecap="round"><path d="M12 11.500 7 6.500M12 11.500 17.500 6M12 11.500 5 16M12 11.500 19.500 14.500M12 11.500 13.500 19.500M17.500 6 19.500 14.500 13.500 19.500M7 6.500 5 16"/></g><g fill="currentColor"><circle cx="12" cy="11.500" r="2.700"/><circle cx="7" cy="6.500" r="2"/><circle cx="17.500" cy="6" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="19.500" cy="14.500" r="2"/><circle cx="13.500" cy="19.500" r="2"/></g></svg>'

def big_map():
    W,H=848,947
    rnd=random.Random(11)
    major=[('Invitations that work',430,470,'sel'),('The three-line door',250,385,'new'),('Your first ten members',610,360,''),('Founding tier pricing',640,585,'new'),
           ('Friday call rhythm',300,640,''),('Welcome sequence',150,540,''),('Paid or free to join',505,740,''),('Pods of five',660,815,''),('What to post first',215,800,'')]
    edges=[(0,1),(0,2),(0,3),(0,4),(1,5),(4,5),(3,6),(4,6),(6,7),(2,3),(4,8),(6,8)]
    minor=[]
    while len(minor)<46:
        x=rnd.uniform(60,W-60); y=rnd.uniform(250,H-70)
        if all((x-a)**2+(y-b)**2>52**2 for a,b in minor) and all((x-m[1])**2+(y-m[2])**2>70**2 for m in major): minor.append((x,y))
    o=[f'<svg class="map" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" aria-label="Graph of community knowledge">',
       '<defs><radialGradient id="neb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#4C6FB5" stop-opacity=".20"/><stop offset="1" stop-color="#4C6FB5" stop-opacity="0"/></radialGradient>'
       '<radialGradient id="aur" cx="50%" cy="50%" r="50%"><stop offset="0" style="stop-color:var(--aurora)" stop-opacity=".55"/><stop offset="1" style="stop-color:var(--aurora)" stop-opacity="0"/></radialGradient>'
       '<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="currentColor" stop-opacity=".5"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>',
       '']
    pts=[(m[1],m[2]) for m in major]
    for (x,y) in minor:
        near=sorted(pts+[p for p in minor if p!=(x,y)], key=lambda p:(p[0]-x)**2+(p[1]-y)**2)[:1 if rnd.random()<.6 else 2]
        for (a,b) in near: o.append(f'<path d="M{x:.0f} {y:.0f}L{a:.0f} {b:.0f}" stroke="currentColor" stroke-opacity=".07" stroke-width=".8"/>')
    for a,b in edges:
        lit = 0 in (a,b)
        o.append(f'<path d="M{major[a][1]} {major[a][2]}L{major[b][1]} {major[b][2]}" stroke="currentColor" stroke-opacity="{".34" if lit else ".13"}" stroke-width="{1 if lit else .8}"/>')
    for (x,y) in minor: o.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.choice([1.4,1.6,2,2.300]):.1f}" fill="currentColor" opacity="{rnd.uniform(.35,.7):.2f}"/>')
    for name,x,y,kind in major:
        if kind=='sel':
            o.append(f'<circle cx="{x}" cy="{y}" r="46" fill="url(#aur)" class="twinkle"/><circle cx="{x}" cy="{y}" r="13" fill="none" stroke="currentColor" stroke-opacity=".5"/><circle cx="{x}" cy="{y}" r="5.500" fill="currentColor"/>')
            o.append(f'<text x="{x+22}" y="{y+5}" class="star-l sel">{name}</text>')
        else:
            if kind=='new': o.append(f'<circle cx="{x}" cy="{y}" r="24" fill="url(#aur)" opacity=".8"/>')
            o.append(f'<circle cx="{x}" cy="{y}" r="14" fill="url(#glow)" opacity=".5"/><circle cx="{x}" cy="{y}" r="3.600" fill="currentColor"/>')
            o.append(f'<text x="{x+14}" y="{y+4}" class="star-l">{name}</text>')
    o.append('</svg>'); return ''.join(o)

MINI=[0]
def mini_map():
    MINI[0]+=1; gid='aur2_%d'%MINI[0]
    n=[(40,96),(92,48),(150,84,'big'),(206,40,'new'),(238,104),(120,126),(64,30),(184,128)]
    e=[(0,1),(1,2),(2,3),(2,4),(2,5),(1,6),(4,7),(5,0)]
    o=['<svg class="mini" viewBox="0 0 280 156" aria-hidden="true"><defs><radialGradient id="'+gid+'" cx="50%" cy="50%" r="50%"><stop offset="0" style="stop-color:var(--aurora)" stop-opacity=".6"/><stop offset="1" style="stop-color:var(--aurora)" stop-opacity="0"/></radialGradient></defs>']
    rnd=random.Random(5)
    for a,b in e: o.append(f'<path d="M{n[a][0]} {n[a][1]}L{n[b][0]} {n[b][1]}" stroke="currentColor" stroke-opacity=".16" stroke-width=".8"/>')
    for p in n:
        k=p[2] if len(p)>2 else ''
        if k=='new': o.append(f'<circle cx="{p[0]}" cy="{p[1]}" r="16" fill="url(#'+gid+')" class="twinkle"/>')
        o.append(f'<circle cx="{p[0]}" cy="{p[1]}" r="{4 if k=="big" else 2.600}" fill="currentColor" opacity="{1 if k else .8}"/>')
    o.append('</svg>'); return ''.join(o)

