"""Check physical offset distances and unchanged top planes at three settings."""
import json
import tempfile
from pathlib import Path
import numpy as np
from generate import build, ROOT
from geometry_core import FLOOR, XY

candidate=json.loads((ROOT/'search-results.json').read_text())['candidates'][0]
with tempfile.TemporaryDirectory() as folder:
    states=[]
    for inset in [0.0,0.15,0.25]:
        state,_=build(candidate,'check',inset,Path(folder));states.append(state)
        for piece in state['pieces']:
            ideal=np.array(piece['region'])*XY
            vertices=np.array(piece['vertices']);n=len(vertices)//2
            footprint=vertices[:n,:2]
            for a,b in zip(ideal,np.roll(ideal,-1,axis=0)):
                edge=b-a;normal=np.array([-edge[1],edge[0]])/np.linalg.norm(edge)
                measured=float(np.min((footprint-a)@normal))
                assert abs(measured-inset)<1e-7,(piece['id'],measured,inset)
            assert np.all(vertices[:n,2]==FLOOR)
            t=piece['term'];transform=state['transform']
            expected=FLOOR+8+transform['z_mm_per_unit']*(
                (vertices[n:,0]*t['a']+vertices[n:,1]*t['b'])/XY+t['c']-transform['subtract_f_min'])
            assert np.allclose(vertices[n:,2],expected,atol=1e-10,rtol=0)
    assert all(s['transform']==states[0]['transform'] for s in states)
print('PASS: offsets 0 / 0.15 / 0.25 mm on all edges; unchanged top planes and underside datum; meshes valid.')
