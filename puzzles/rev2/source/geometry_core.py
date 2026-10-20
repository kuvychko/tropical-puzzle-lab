"""Convex polygon clipping and closed planar-top meshes; units in mm."""
import numpy as np
import struct
from collections import Counter
SPAN=144.0
DOMAIN=3.2
XY=SPAN/(2*DOMAIN)
FLOOR=3.0
DEFAULT_XY_INSET_MM=0.15  # inward normal offset per footprint edge, not scale factor
WALL=4.0
RIM_HEIGHT=7.0

def clean(p):
    out=[]
    for v in p:
        v=np.asarray(v,float)
        if not out or np.linalg.norm(v-out[-1])>1e-8: out.append(v)
    if len(out)>1 and np.linalg.norm(out[0]-out[-1])<1e-8: out.pop()
    return out

def clip(poly, normal, threshold):
    """Keep normal dot p >= threshold, preserving CCW winding."""
    if not poly: return []
    normal=np.asarray(normal)
    result=[]
    for p,q in zip(poly,poly[1:]+poly[:1]):
        fp=np.dot(normal,p)-threshold; fq=np.dot(normal,q)-threshold
        if fp>=-1e-9: result.append(p)
        if (fp>1e-9 and fq<-1e-9) or (fp<-1e-9 and fq>1e-9):
            result.append(p+(q-p)*fp/(fp-fq))
    return clean(result)

def area(poly):
    if len(poly)<3:return 0.0
    return sum(p[0]*q[1]-p[1]*q[0] for p,q in zip(poly,poly[1:]+poly[:1]))/2

def inset(poly, distance):
    result=poly[:]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        d=b-a; n=np.array([-d[1],d[0]])/np.linalg.norm(d)
        result=clip(result,n,np.dot(n,a)+distance)
    return result

def prism(poly, height, bottom=FLOOR):
    """Convex CCW polygon + affine height -> closed oriented mesh."""
    n=len(poly)
    vertices=[[float(p[0]),float(p[1]),float(bottom)] for p in poly]
    vertices += [[float(p[0]),float(p[1]),float(height(p))] for p in poly]
    faces=[]
    for k in range(1,n-1):faces += [[0,k+1,k],[n,n+k,n+k+1]]
    for k in range(n):
        j=(k+1)%n; faces += [[k,j,n+j],[k,n+j,n+k]]
    # Untriangulated faces are useful for clean visual rendering.
    panels=[list(range(n-1,-1,-1)),list(range(n,2*n))]
    panels += [[k,(k+1)%n,(k+1)%n+n,k+n] for k in range(n)]
    return {'vertices':vertices,'faces':faces,'panels':panels}

def validate(mesh):
    v=np.array(mesh['vertices']); f=np.array(mesh['faces']); edges=Counter()
    directed=Counter()
    for face in f:
        for a,b in zip(face,np.roll(face,-1)):
            edges[tuple(sorted([a,b]))]+=1; directed[(a,b)]+=1
    assert all(n==2 for n in edges.values()),'non-manifold edge'
    assert all(directed[(b,a)]==n for (a,b),n in directed.items()),'inconsistent winding'
    tris=v[f]
    assert np.all(np.linalg.norm(np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]),axis=1)>1e-8)
    volume=np.einsum('ij,ij->i',tris[:,0],np.cross(tris[:,1],tris[:,2])).sum()/6
    assert volume>0
    return float(volume)

def write_stl(path,mesh):
    v=np.array(mesh['vertices']); f=mesh['faces']
    with path.open('wb') as out:
        out.write(b'Tropical puzzle prototype, units mm'.ljust(80,b' '));out.write(struct.pack('<I',len(f)))
        for indices in f:
            tri=v[indices];normal=np.cross(tri[1]-tri[0],tri[2]-tri[0]);normal/=np.linalg.norm(normal)
            out.write(struct.pack('<12fH',*normal,*tri.ravel(),0))

def tray():
    # Single watertight tray, rectangular rings at outer bottom, outer rim,
    # inner rim and cavity floor. No overlapping solid boxes.
    h=SPAN/2;outer=h+WALL
    ring=lambda r,z:[[-r,-r,z],[r,-r,z],[r,r,z],[-r,r,z]]
    vertices=ring(outer,0)+ring(outer,FLOOR+RIM_HEIGHT)+ring(h,FLOOR+RIM_HEIGHT)+ring(h,FLOOR)
    panels=[[3,2,1,0],[12,13,14,15]]
    for k in range(4):
        j=(k+1)%4
        panels += [[k,j,4+j,4+k],[4+k,4+j,8+j,8+k],[8+k,8+j,12+j,12+k]]
    faces=[]
    for p in panels:
        for j in range(1,len(p)-1):faces.append([p[0],p[j],p[j+1]])
    return {'vertices':vertices,'faces':faces,'panels':panels}
