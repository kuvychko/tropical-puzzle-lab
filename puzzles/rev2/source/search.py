"""Reproducible nine-piece tropical puzzle candidate search (integer slopes)."""
from pathlib import Path
import json
import numpy as np
from geometry_core import clip, area, DOMAIN, XY

ROOT=Path(__file__).resolve().parent
RNG=np.random.default_rng(20260928)
OUTER=np.array([[-6,-4],[4,-6],[7,1],[1,7],[-6,4]],float)
GRID=np.array([(i,j) for i in range(-2,3) for j in range(-2,3) if (i,j)!=(0,0)],float)
BOX=[np.array(p,float) for p in [(-DOMAIN,-DOMAIN),(DOMAIN,-DOMAIN),(DOMAIN,DOMAIN),(-DOMAIN,DOMAIN)]]
ANGLES=np.linspace(0,2*np.pi,72,endpoint=False)
DIRECTIONS=np.column_stack([np.cos(ANGLES),np.sin(ANGLES)])

def regions(slopes,c):
    result=[]
    for i in range(len(c)):
        p=BOX[:]
        for j in range(len(c)):
            if i!=j:p=clip(p,slopes[i]-slopes[j],c[j]-c[i])
            if len(p)<3:break
        if area(p)<1e-7:return None
        result.append(np.array(p))
    return result

def centroid(p):
    q=np.roll(p,-1,axis=0);cross=p[:,0]*q[:,1]-q[:,0]*p[:,1]
    return ((p+q)*cross[:,None]).sum(axis=0)/(3*cross.sum())

def metrics(polys):
    areas=np.array([area(list(p)) for p in polys])*XY**2
    interior=[i for i,p in enumerate(polys) if np.max(np.abs(p))<DOMAIN-1e-7]
    widths=[];supports=[];edges=[]
    for p in polys:
        dot=p@DIRECTIONS.T
        edges_for_width=np.roll(p,-1,axis=0)-p
        normals=np.column_stack([-edges_for_width[:,1],edges_for_width[:,0]])
        normals/=np.linalg.norm(normals,axis=1)[:,None]
        exact_projection=p@normals.T
        widths.append(float(np.ptp(exact_projection,axis=0).min()*XY))
        supports.append(((p-centroid(p))@DIRECTIONS.T).max(axis=0)*XY)
        edges.extend(np.linalg.norm(np.roll(p,-1,axis=0)-p,axis=1)*XY)
    pairs=[]
    for i in range(9):
        for j in range(i):
            # Approximate shape resemblance at identical physical scale.
            err=[np.sqrt(np.mean((supports[i]-np.roll(supports[j],k))**2)) for k in range(72)]
            k=int(np.argmin(err));pairs.append({'i':j,'j':i,'rms_mm':float(err[k]),'rotation_deg':k*5})
    pairs.sort(key=lambda x:x['rms_mm'])
    return {'interior':interior,'areas_mm2':areas.tolist(),'widths_mm':widths,'min_edge_mm':min(edges),'area_ratio':float(max(areas)/min(areas)),'similar_pairs':pairs[:5]}

def run(n=1800):
    candidates=[];valid=0
    for trial in range(n):
        if trial%300==0:print('Search',trial,'accepted',len(candidates),flush=True)
        inner=GRID[RNG.choice(len(GRID),4,replace=False)]
        dist=np.linalg.norm(inner[:,None]-inner[None,:],axis=2)+np.eye(4)*100
        if dist.min()<1.7:continue
        slopes=np.vstack([OUTER,inner])
        angle=RNG.uniform(-.16,.16)
        # Vary convex lifting curvature and shear, not arbitrary footprint cuts.
        Q=np.array([[RNG.uniform(.18,.27),angle],[angle,RNG.uniform(.18,.27)]])
        if np.linalg.eigvalsh(Q).min()<.10:continue
        shift=RNG.uniform(-.35,.35,2)
        c=-np.einsum('ij,jk,ik->i',slopes,Q,slopes)+slopes@shift+RNG.normal(0,.55,9)
        p=regions(slopes,c)
        if p is None:continue
        interior=[i for i,v in enumerate(p) if np.max(np.abs(v))<DOMAIN-1e-7]
        if len(interior)<3:continue
        a=np.array([area(list(v)) for v in p])*XY**2
        if a.min()<700 or a.max()/a.min()>4.5:continue
        m=metrics(p)
        if min(m['widths_mm'])<23 or m['min_edge_mm']<2.0:continue
        valid+=1
        score=12*len(interior)-2.5*np.std(a)/np.mean(a)-.25*sum(x['rms_mm'] for x in m['similar_pairs'][:3])+.025*min(m['widths_mm'])
        candidates.append({'trial':trial,'score':float(score),'slopes':slopes.astype(int).tolist(),'coefficients':c.tolist(),'polygons':[v.tolist() for v in p],'metrics':m})
    candidates.sort(key=lambda t:t['score'],reverse=True)
    result={'seed':20260928,'trials':n,'valid_candidates':valid,'ranking_is_difficulty_proxy':True,'candidates':candidates[:12]}
    (ROOT/'search-results.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({'valid':valid,'top':[{'trial':x['trial'],'score':x['score'],'interior':x['metrics']['interior'],'ratio':x['metrics']['area_ratio'],'width':min(x['metrics']['widths_mm']),'pairs':x['metrics']['similar_pairs'][:2]} for x in candidates[:4]]},indent=2))
    return result

if __name__=='__main__':run()
